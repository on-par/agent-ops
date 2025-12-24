import { Octokit } from "octokit";
import { v4 as uuidv4 } from "uuid";
import type { DrizzleDatabase } from "../../../db/index.js";
import { RepositoryRepository } from "../../repositories/repositories/repository.repository.js";
import { GitHubConnectionRepository } from "../repositories/github-connection.repository.js";
import { WorkItemRepository } from "../../work-items/repositories/work-item.repository.js";
import type { Repository, WorkItemType, WorkItemStatus } from "../../../db/schema.js";

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  html_url: string;
  labels: Array<{ name: string }>;
  created_at: string;
  updated_at: string;
}

interface SyncResult {
  created: number;
  updated: number;
  errors: string[];
}

export class GitHubSyncService {
  private repoRepository: RepositoryRepository;
  private connectionRepo: GitHubConnectionRepository;
  private workItemRepo: WorkItemRepository;

  constructor(db: DrizzleDatabase) {
    this.repoRepository = new RepositoryRepository(db);
    this.connectionRepo = new GitHubConnectionRepository(db);
    this.workItemRepo = new WorkItemRepository(db);
  }

  /**
   * Sync issues for a specific repository
   */
  async syncRepository(repositoryId: string): Promise<SyncResult> {
    const repo = await this.repoRepository.findById(repositoryId);
    if (!repo) {
      throw new Error(`Repository not found: ${repositoryId}`);
    }

    if (!repo.syncEnabled) {
      throw new Error("Sync is disabled for this repository");
    }

    const connection = await this.connectionRepo.findById(repo.connectionId);
    if (!connection) {
      throw new Error("GitHub connection not found");
    }

    // Mark as syncing
    await this.repoRepository.updateSyncStatus(repo.id, "syncing");

    try {
      const octokit = new Octokit({ auth: connection.accessToken });
      const result = await this.syncIssues(octokit, repo);

      // Mark as synced
      await this.repoRepository.updateSyncStatus(repo.id, "synced");

      return result;
    } catch (error) {
      // Mark as error
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await this.repoRepository.updateSyncStatus(repo.id, "error", errorMessage);
      throw error;
    }
  }

  /**
   * Sync all enabled repositories
   */
  async syncAllRepositories(): Promise<Map<string, SyncResult>> {
    const repos = await this.repoRepository.findSyncEnabled();
    const results = new Map<string, SyncResult>();

    for (const repo of repos) {
      try {
        const result = await this.syncRepository(repo.id);
        results.set(repo.id, result);
      } catch (error) {
        results.set(repo.id, {
          created: 0,
          updated: 0,
          errors: [error instanceof Error ? error.message : "Unknown error"],
        });
      }
    }

    return results;
  }

  private async syncIssues(octokit: Octokit, repo: Repository): Promise<SyncResult> {
    const result: SyncResult = { created: 0, updated: 0, errors: [] };

    try {
      // Fetch issues from GitHub
      const issues = await this.fetchAllIssues(octokit, repo);

      for (const issue of issues) {
        try {
          // Check if issue matches label filter
          if (!this.matchesLabelFilter(issue, repo.issueLabelsFilter)) {
            continue;
          }

          // Check if work item already exists for this issue
          const existingWorkItems = await this.workItemRepo.findAll();
          const existing = existingWorkItems.find(
            (wi) => wi.githubIssueId === issue.id
          );

          if (existing) {
            // Update existing work item
            await this.updateWorkItemFromIssue(existing.id, issue);
            result.updated++;
          } else {
            // Create new work item
            await this.createWorkItemFromIssue(repo, issue);
            result.created++;
          }
        } catch (error) {
          result.errors.push(
            `Issue #${issue.number}: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        }
      }
    } catch (error) {
      result.errors.push(
        `Failed to fetch issues: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    return result;
  }

  private async fetchAllIssues(
    octokit: Octokit,
    repo: Repository
  ): Promise<GitHubIssue[]> {
    const allIssues: GitHubIssue[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const { data } = await octokit.rest.issues.listForRepo({
        owner: repo.owner,
        repo: repo.name,
        state: "all",
        per_page: perPage,
        page,
      });

      // Filter out pull requests (they come through issues API)
      const issues = data.filter((item) => !("pull_request" in item)) as GitHubIssue[];
      allIssues.push(...issues);

      if (data.length < perPage) {
        break;
      }
      page++;
    }

    return allIssues;
  }

  private matchesLabelFilter(issue: GitHubIssue, labelFilter: string[]): boolean {
    // Empty filter = sync all issues
    if (labelFilter.length === 0) {
      return true;
    }

    // Check if issue has any of the required labels
    const issueLabels = issue.labels.map((l) => l.name.toLowerCase());
    return labelFilter.some((filter) =>
      issueLabels.includes(filter.toLowerCase())
    );
  }

  private async createWorkItemFromIssue(
    repo: Repository,
    issue: GitHubIssue
  ): Promise<void> {
    const workItemType = this.inferWorkItemType(issue);
    const status = this.mapGitHubStateToStatus(issue.state);
    const now = new Date();

    await this.workItemRepo.create({
      id: uuidv4(),
      title: issue.title,
      type: workItemType,
      status,
      description: issue.body ?? "",
      createdBy: "github-sync",
      repositoryId: repo.id,
      githubIssueId: issue.id,
      githubIssueNumber: issue.number,
      githubIssueUrl: issue.html_url,
      createdAt: now,
      updatedAt: now,
    });
  }

  private async updateWorkItemFromIssue(
    workItemId: string,
    issue: GitHubIssue
  ): Promise<void> {
    const status = this.mapGitHubStateToStatus(issue.state);

    await this.workItemRepo.update(workItemId, {
      title: issue.title,
      description: issue.body ?? "",
      status,
    });
  }

  private inferWorkItemType(issue: GitHubIssue): WorkItemType {
    const labels = issue.labels.map((l) => l.name.toLowerCase());

    if (labels.includes("bug") || labels.includes("fix")) {
      return "bug";
    }
    if (labels.includes("feature") || labels.includes("enhancement")) {
      return "feature";
    }
    if (labels.includes("research") || labels.includes("investigation")) {
      return "research";
    }

    return "task";
  }

  private mapGitHubStateToStatus(state: "open" | "closed"): WorkItemStatus {
    return state === "closed" ? "done" : "backlog";
  }

  /**
   * Sync work item status back to GitHub
   */
  async syncWorkItemToGitHub(workItemId: string): Promise<void> {
    const workItem = await this.workItemRepo.findById(workItemId);
    if (!workItem) {
      throw new Error(`Work item not found: ${workItemId}`);
    }

    if (!workItem.repositoryId || !workItem.githubIssueNumber) {
      // Not a GitHub-synced work item
      return;
    }

    const repo = await this.repoRepository.findById(workItem.repositoryId);
    if (!repo) {
      throw new Error("Repository not found");
    }

    const connection = await this.connectionRepo.findById(repo.connectionId);
    if (!connection) {
      throw new Error("GitHub connection not found");
    }

    const octokit = new Octokit({ auth: connection.accessToken });

    // Map work item status to GitHub state
    const state: "open" | "closed" = workItem.status === "done" ? "closed" : "open";

    await octokit.rest.issues.update({
      owner: repo.owner,
      repo: repo.name,
      issue_number: workItem.githubIssueNumber,
      state,
    });
  }
}
