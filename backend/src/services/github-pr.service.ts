import { Octokit } from "octokit";
import type { DrizzleDatabase } from "../db/index.js";
import { RepositoryRepository } from "../repositories/repository.repository.js";
import { GitHubConnectionRepository } from "../repositories/github-connection.repository.js";
import { WorkItemRepository } from "../features/work-items/repositories/work-item.repository.js";

export interface CreatePRInput {
  workItemId: string;
  branchName: string;
  title: string;
  body: string;
  baseBranch?: string | undefined; // Defaults to repo's default branch
  draft?: boolean | undefined;
}

export interface PRResult {
  number: number;
  htmlUrl: string;
  state: string;
  merged: boolean;
  headRef: string;
  baseRef: string;
}

export class GitHubPRService {
  private repoRepository: RepositoryRepository;
  private connectionRepo: GitHubConnectionRepository;
  private workItemRepo: WorkItemRepository;

  constructor(db: DrizzleDatabase) {
    this.repoRepository = new RepositoryRepository(db);
    this.connectionRepo = new GitHubConnectionRepository(db);
    this.workItemRepo = new WorkItemRepository(db);
  }

  /**
   * Create a pull request from agent work on a work item
   */
  async createPullRequest(input: CreatePRInput): Promise<PRResult> {
    const { workItemId, branchName, title, body, baseBranch, draft } = input;

    // Get work item and validate
    const workItem = await this.workItemRepo.findById(workItemId);
    if (!workItem) {
      throw new Error(`Work item not found: ${workItemId}`);
    }

    if (!workItem.repositoryId) {
      throw new Error("Work item is not associated with a repository");
    }

    // Get repository and connection
    const repo = await this.repoRepository.findById(workItem.repositoryId);
    if (!repo) {
      throw new Error("Repository not found");
    }

    const connection = await this.connectionRepo.findById(repo.connectionId);
    if (!connection) {
      throw new Error("GitHub connection not found");
    }

    const octokit = new Octokit({ auth: connection.accessToken });

    // Build PR body with context
    const prBody = this.buildPRBody(body, workItem);

    // Create the PR
    const { data: pr } = await octokit.rest.pulls.create({
      owner: repo.owner,
      repo: repo.name,
      title,
      body: prBody,
      head: branchName,
      base: baseBranch ?? repo.defaultBranch,
      draft: draft ?? false,
    });

    return {
      number: pr.number,
      htmlUrl: pr.html_url,
      state: pr.state,
      merged: pr.merged,
      headRef: pr.head.ref,
      baseRef: pr.base.ref,
    };
  }

  /**
   * Get the status of a pull request
   */
  async getPullRequestStatus(
    repositoryId: string,
    prNumber: number
  ): Promise<PRResult & { mergeable: boolean | null; reviewDecision: string | null }> {
    const repo = await this.repoRepository.findById(repositoryId);
    if (!repo) {
      throw new Error("Repository not found");
    }

    const connection = await this.connectionRepo.findById(repo.connectionId);
    if (!connection) {
      throw new Error("GitHub connection not found");
    }

    const octokit = new Octokit({ auth: connection.accessToken });

    const { data: pr } = await octokit.rest.pulls.get({
      owner: repo.owner,
      repo: repo.name,
      pull_number: prNumber,
    });

    // Get review decision via GraphQL for more detail
    let reviewDecision: string | null = null;
    try {
      const { repository } = await octokit.graphql<{
        repository: { pullRequest: { reviewDecision: string | null } };
      }>(`
        query($owner: String!, $repo: String!, $number: Int!) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $number) {
              reviewDecision
            }
          }
        }
      `, {
        owner: repo.owner,
        repo: repo.name,
        number: prNumber,
      });
      reviewDecision = repository.pullRequest.reviewDecision;
    } catch {
      // GraphQL might not be available, continue without review decision
    }

    return {
      number: pr.number,
      htmlUrl: pr.html_url,
      state: pr.state,
      merged: pr.merged,
      headRef: pr.head.ref,
      baseRef: pr.base.ref,
      mergeable: pr.mergeable,
      reviewDecision,
    };
  }

  /**
   * Create a branch for agent work
   */
  async createBranch(
    repositoryId: string,
    branchName: string,
    fromBranch?: string
  ): Promise<{ ref: string; sha: string }> {
    const repo = await this.repoRepository.findById(repositoryId);
    if (!repo) {
      throw new Error("Repository not found");
    }

    const connection = await this.connectionRepo.findById(repo.connectionId);
    if (!connection) {
      throw new Error("GitHub connection not found");
    }

    const octokit = new Octokit({ auth: connection.accessToken });

    // Get the SHA of the base branch
    const baseBranch = fromBranch ?? repo.defaultBranch;
    const { data: baseRef } = await octokit.rest.git.getRef({
      owner: repo.owner,
      repo: repo.name,
      ref: `heads/${baseBranch}`,
    });

    // Create the new branch
    const { data: newRef } = await octokit.rest.git.createRef({
      owner: repo.owner,
      repo: repo.name,
      ref: `refs/heads/${branchName}`,
      sha: baseRef.object.sha,
    });

    return {
      ref: newRef.ref,
      sha: newRef.object.sha,
    };
  }

  /**
   * Link a PR to its originating issue
   */
  async linkPRToIssue(
    repositoryId: string,
    prNumber: number,
    issueNumber: number
  ): Promise<void> {
    const repo = await this.repoRepository.findById(repositoryId);
    if (!repo) {
      throw new Error("Repository not found");
    }

    const connection = await this.connectionRepo.findById(repo.connectionId);
    if (!connection) {
      throw new Error("GitHub connection not found");
    }

    const octokit = new Octokit({ auth: connection.accessToken });

    // Add a comment to the PR linking to the issue
    await octokit.rest.issues.createComment({
      owner: repo.owner,
      repo: repo.name,
      issue_number: prNumber, // PRs are issues in GitHub API
      body: `This PR addresses #${issueNumber}`,
    });
  }

  /**
   * Generate a branch name for agent work
   */
  generateBranchName(workItemId: string, prefix = "agent"): string {
    const timestamp = Date.now().toString(36);
    const shortId = workItemId.slice(0, 8);
    return `${prefix}/${shortId}-${timestamp}`;
  }

  private buildPRBody(
    body: string,
    workItem: { id: string; title: string; githubIssueNumber?: number | null; githubIssueUrl?: string | null }
  ): string {
    const parts: string[] = [];

    // Add the provided body
    if (body) {
      parts.push(body);
    }

    // Add work item context
    parts.push("\n---\n");
    parts.push("## Agent Context\n");
    parts.push(`- **Work Item**: ${workItem.title}`);
    parts.push(`- **Work Item ID**: \`${workItem.id}\``);

    // Link to originating issue if available
    if (workItem.githubIssueNumber) {
      parts.push(`- **Resolves**: #${workItem.githubIssueNumber}`);
    }

    // Add agent attribution
    parts.push("\n---\n");
    parts.push("*This PR was created by an AI agent via Agent Ops.*");

    return parts.join("\n");
  }

  /**
   * Request reviews for a PR
   */
  async requestReviews(
    repositoryId: string,
    prNumber: number,
    reviewers: string[]
  ): Promise<void> {
    if (reviewers.length === 0) {
      return;
    }

    const repo = await this.repoRepository.findById(repositoryId);
    if (!repo) {
      throw new Error("Repository not found");
    }

    const connection = await this.connectionRepo.findById(repo.connectionId);
    if (!connection) {
      throw new Error("GitHub connection not found");
    }

    const octokit = new Octokit({ auth: connection.accessToken });

    await octokit.rest.pulls.requestReviewers({
      owner: repo.owner,
      repo: repo.name,
      pull_number: prNumber,
      reviewers,
    });
  }

  /**
   * Merge a PR if it's ready
   */
  async mergePullRequest(
    repositoryId: string,
    prNumber: number,
    mergeMethod: "merge" | "squash" | "rebase" = "squash"
  ): Promise<{ merged: boolean; message: string }> {
    const repo = await this.repoRepository.findById(repositoryId);
    if (!repo) {
      throw new Error("Repository not found");
    }

    const connection = await this.connectionRepo.findById(repo.connectionId);
    if (!connection) {
      throw new Error("GitHub connection not found");
    }

    const octokit = new Octokit({ auth: connection.accessToken });

    try {
      const { data } = await octokit.rest.pulls.merge({
        owner: repo.owner,
        repo: repo.name,
        pull_number: prNumber,
        merge_method: mergeMethod,
      });

      return {
        merged: data.merged,
        message: data.message,
      };
    } catch (error) {
      return {
        merged: false,
        message: error instanceof Error ? error.message : "Merge failed",
      };
    }
  }
}
