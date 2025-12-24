import { createHmac, timingSafeEqual } from "crypto";
import { v4 as uuidv4 } from "uuid";
import type { DrizzleDatabase } from "../../shared/db/index.js";
import { RepositoryRepository } from "../../repositories/repositories/repository.repository.js";
import { WorkItemRepository } from "../../work-items/repositories/work-item.repository.js";
import type { WorkItemType, WorkItemStatus } from "../../shared/db/schema.js";

// GitHub webhook event types we handle
export type WebhookEventType =
  | "issues"
  | "pull_request"
  | "issue_comment"
  | "pull_request_review"
  | "pull_request_review_comment"
  | "ping";

// GitHub webhook payload interfaces
interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
}

interface GitHubLabel {
  name: string;
  color: string;
}

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  labels: GitHubLabel[];
  user: GitHubUser;
  created_at: string;
  updated_at: string;
}

interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  merged: boolean;
  html_url: string;
  labels: GitHubLabel[];
  user: GitHubUser;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
  };
}

interface GitHubComment {
  id: number;
  body: string;
  html_url: string;
  user: GitHubUser;
  created_at: string;
}

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
}

// Webhook payload types
export interface IssueWebhookPayload {
  action: "opened" | "edited" | "closed" | "reopened" | "labeled" | "unlabeled" | "deleted";
  issue: GitHubIssue;
  repository: GitHubRepository;
  sender: GitHubUser;
}

export interface PullRequestWebhookPayload {
  action: "opened" | "edited" | "closed" | "reopened" | "synchronize" | "labeled" | "unlabeled";
  pull_request: GitHubPullRequest;
  repository: GitHubRepository;
  sender: GitHubUser;
}

export interface IssueCommentWebhookPayload {
  action: "created" | "edited" | "deleted";
  issue: GitHubIssue;
  comment: GitHubComment;
  repository: GitHubRepository;
  sender: GitHubUser;
}

export interface PingWebhookPayload {
  zen: string;
  hook_id: number;
  repository: GitHubRepository;
}

export type WebhookPayload =
  | IssueWebhookPayload
  | PullRequestWebhookPayload
  | IssueCommentWebhookPayload
  | PingWebhookPayload;

// Result of processing a webhook
export interface WebhookResult {
  success: boolean;
  message: string;
  workItemId?: string;
  action?: string;
}

export class GitHubWebhookService {
  private webhookSecret: string;
  private repoRepository: RepositoryRepository;
  private workItemRepo: WorkItemRepository;

  constructor(db: DrizzleDatabase, webhookSecret: string) {
    this.webhookSecret = webhookSecret;
    this.repoRepository = new RepositoryRepository(db);
    this.workItemRepo = new WorkItemRepository(db);
  }

  /**
   * Verify the webhook signature using HMAC SHA-256
   */
  verifySignature(payload: string, signature: string | undefined): boolean {
    if (!this.webhookSecret) {
      // If no secret configured, skip verification (development mode)
      return true;
    }

    if (!signature) {
      return false;
    }

    // GitHub sends signature as "sha256=<hash>"
    const expectedSignature = `sha256=${createHmac("sha256", this.webhookSecret)
      .update(payload)
      .digest("hex")}`;

    // Use timing-safe comparison to prevent timing attacks
    try {
      return timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  /**
   * Process an incoming webhook event
   */
  async processWebhook(
    eventType: WebhookEventType,
    payload: WebhookPayload
  ): Promise<WebhookResult> {
    switch (eventType) {
      case "ping":
        return this.handlePing(payload as PingWebhookPayload);

      case "issues":
        return this.handleIssueEvent(payload as IssueWebhookPayload);

      case "pull_request":
        return this.handlePullRequestEvent(payload as PullRequestWebhookPayload);

      case "issue_comment":
        return this.handleIssueCommentEvent(payload as IssueCommentWebhookPayload);

      case "pull_request_review":
      case "pull_request_review_comment":
        // Log but don't process these yet
        return {
          success: true,
          message: `Acknowledged ${eventType} event (not processed)`,
        };

      default:
        return {
          success: true,
          message: `Unknown event type: ${eventType}`,
        };
    }
  }

  private handlePing(payload: PingWebhookPayload): WebhookResult {
    return {
      success: true,
      message: `Webhook configured successfully for ${payload.repository.full_name}. ${payload.zen}`,
    };
  }

  private async handleIssueEvent(payload: IssueWebhookPayload): Promise<WebhookResult> {
    const { action, issue, repository } = payload;

    // Find the connected repository in our database
    const repo = await this.findRepositoryByGitHubId(repository.id);
    if (!repo) {
      return {
        success: true,
        message: `Repository ${repository.full_name} not connected, skipping`,
      };
    }

    if (!repo.syncEnabled) {
      return {
        success: true,
        message: `Sync disabled for ${repository.full_name}, skipping`,
      };
    }

    // Check label filter
    if (!this.matchesLabelFilter(issue.labels, repo.issueLabelsFilter)) {
      return {
        success: true,
        message: `Issue #${issue.number} doesn't match label filter, skipping`,
      };
    }

    switch (action) {
      case "opened":
        return this.createWorkItemFromIssue(repo.id, issue);

      case "edited":
      case "labeled":
      case "unlabeled":
        return this.updateWorkItemFromIssue(issue);

      case "closed":
        return this.closeWorkItemFromIssue(issue);

      case "reopened":
        return this.reopenWorkItemFromIssue(issue);

      case "deleted":
        return this.deleteWorkItemFromIssue(issue);

      default:
        return {
          success: true,
          message: `Issue action '${action}' not handled`,
        };
    }
  }

  private async handlePullRequestEvent(
    payload: PullRequestWebhookPayload
  ): Promise<WebhookResult> {
    const { action, pull_request, repository } = payload;

    // Find the connected repository
    const repo = await this.findRepositoryByGitHubId(repository.id);
    if (!repo) {
      return {
        success: true,
        message: `Repository ${repository.full_name} not connected, skipping`,
      };
    }

    // For now, we just log PR events
    // Future: Link PRs to work items, track merge status
    const prStatus = pull_request.merged ? "merged" : pull_request.state;

    return {
      success: true,
      message: `PR #${pull_request.number} ${action} (${prStatus}) in ${repository.full_name}`,
      action: `pr_${action}`,
    };
  }

  private async handleIssueCommentEvent(
    payload: IssueCommentWebhookPayload
  ): Promise<WebhookResult> {
    const { action, issue, comment, repository } = payload;

    // Find the connected repository
    const repo = await this.findRepositoryByGitHubId(repository.id);
    if (!repo) {
      return {
        success: true,
        message: `Repository ${repository.full_name} not connected, skipping`,
      };
    }

    // For now, log comment events
    // Future: Trigger agent actions based on @mentions or commands
    return {
      success: true,
      message: `Comment ${action} on issue #${issue.number} by ${comment.user.login}`,
      action: `comment_${action}`,
    };
  }

  private async findRepositoryByGitHubId(githubRepoId: number) {
    const repos = await this.repoRepository.findAll();
    return repos.find((r) => r.githubRepoId === githubRepoId);
  }

  private matchesLabelFilter(labels: GitHubLabel[], filter: string[]): boolean {
    if (filter.length === 0) {
      return true;
    }
    const labelNames = labels.map((l) => l.name.toLowerCase());
    return filter.some((f) => labelNames.includes(f.toLowerCase()));
  }

  private async createWorkItemFromIssue(
    repositoryId: string,
    issue: GitHubIssue
  ): Promise<WebhookResult> {
    // Check if work item already exists
    const existing = await this.findWorkItemByGitHubIssueId(issue.id);
    if (existing) {
      return {
        success: true,
        message: `Work item already exists for issue #${issue.number}`,
        workItemId: existing.id,
      };
    }

    const workItemType = this.inferWorkItemType(issue.labels);
    const now = new Date();

    const workItem = await this.workItemRepo.create({
      id: uuidv4(),
      title: issue.title,
      type: workItemType,
      status: "backlog",
      description: issue.body ?? "",
      createdBy: "github-webhook",
      repositoryId,
      githubIssueId: issue.id,
      githubIssueNumber: issue.number,
      githubIssueUrl: issue.html_url,
      createdAt: now,
      updatedAt: now,
    });

    return {
      success: true,
      message: `Created work item from issue #${issue.number}`,
      workItemId: workItem.id,
      action: "created",
    };
  }

  private async updateWorkItemFromIssue(issue: GitHubIssue): Promise<WebhookResult> {
    const workItem = await this.findWorkItemByGitHubIssueId(issue.id);
    if (!workItem) {
      return {
        success: true,
        message: `No work item found for issue #${issue.number}`,
      };
    }

    await this.workItemRepo.update(workItem.id, {
      title: issue.title,
      description: issue.body ?? "",
    });

    return {
      success: true,
      message: `Updated work item from issue #${issue.number}`,
      workItemId: workItem.id,
      action: "updated",
    };
  }

  private async closeWorkItemFromIssue(issue: GitHubIssue): Promise<WebhookResult> {
    const workItem = await this.findWorkItemByGitHubIssueId(issue.id);
    if (!workItem) {
      return {
        success: true,
        message: `No work item found for issue #${issue.number}`,
      };
    }

    await this.workItemRepo.update(workItem.id, {
      status: "done",
      completedAt: new Date(),
    });

    return {
      success: true,
      message: `Closed work item from issue #${issue.number}`,
      workItemId: workItem.id,
      action: "closed",
    };
  }

  private async reopenWorkItemFromIssue(issue: GitHubIssue): Promise<WebhookResult> {
    const workItem = await this.findWorkItemByGitHubIssueId(issue.id);
    if (!workItem) {
      return {
        success: true,
        message: `No work item found for issue #${issue.number}`,
      };
    }

    await this.workItemRepo.update(workItem.id, {
      status: "backlog",
      completedAt: null,
    });

    return {
      success: true,
      message: `Reopened work item from issue #${issue.number}`,
      workItemId: workItem.id,
      action: "reopened",
    };
  }

  private async deleteWorkItemFromIssue(issue: GitHubIssue): Promise<WebhookResult> {
    const workItem = await this.findWorkItemByGitHubIssueId(issue.id);
    if (!workItem) {
      return {
        success: true,
        message: `No work item found for issue #${issue.number}`,
      };
    }

    await this.workItemRepo.delete(workItem.id);

    return {
      success: true,
      message: `Deleted work item from issue #${issue.number}`,
      workItemId: workItem.id,
      action: "deleted",
    };
  }

  private async findWorkItemByGitHubIssueId(githubIssueId: number) {
    const workItems = await this.workItemRepo.findAll();
    return workItems.find((wi) => wi.githubIssueId === githubIssueId);
  }

  private inferWorkItemType(labels: GitHubLabel[]): WorkItemType {
    const labelNames = labels.map((l) => l.name.toLowerCase());

    if (labelNames.includes("bug") || labelNames.includes("fix")) {
      return "bug";
    }
    if (labelNames.includes("feature") || labelNames.includes("enhancement")) {
      return "feature";
    }
    if (labelNames.includes("research") || labelNames.includes("investigation")) {
      return "research";
    }

    return "task";
  }
}
