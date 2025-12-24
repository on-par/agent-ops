import { simpleGit, type StatusResult } from "simple-git";

/**
 * Options for cloning a repository
 */
export interface GitCloneOptions {
  url: string;
  path: string;
  token?: string;
  branch?: string;
}

/**
 * Options for creating a commit
 */
export interface GitCommitOptions {
  message: string;
  author?: { name: string; email: string };
}

/**
 * Git status summary
 */
export interface GitStatus {
  staged: string[];
  modified: string[];
  untracked: string[];
}

/**
 * Service for Git operations using simple-git
 * Provides clone, branch, commit, push, diff, and status functionality
 */
export class GitOperationsService {
  /**
   * Clone a repository with optional authentication and branch
   */
  async cloneRepository(options: GitCloneOptions): Promise<void> {
    const { url, path, token, branch } = options;

    try {
      // Build authenticated URL if token provided
      const cloneUrl = token ? this.buildAuthenticatedUrl(url, token) : url;

      const git = simpleGit();

      // Clone options
      const cloneOptions: string[] = ["--depth", "1"]; // Shallow clone for efficiency

      if (branch) {
        cloneOptions.push("--branch", branch);
      }

      await git.clone(cloneUrl, path, cloneOptions);
    } catch (error) {
      throw new Error(
        `Failed to clone repository: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Create and checkout a new branch
   */
  async createBranch(repoPath: string, branchName: string): Promise<void> {
    try {
      const git = simpleGit(repoPath);
      await git.checkoutLocalBranch(branchName);
    } catch (error) {
      throw new Error(
        `Failed to create branch: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Get the current branch name
   */
  async getCurrentBranch(repoPath: string): Promise<string> {
    try {
      const git = simpleGit(repoPath);
      const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
      return branch.trim();
    } catch (error) {
      throw new Error(
        `Failed to get current branch: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Stage all changes (equivalent to git add .)
   */
  async stageAllChanges(repoPath: string): Promise<void> {
    try {
      const git = simpleGit(repoPath);
      await git.add(".");
    } catch (error) {
      throw new Error(
        `Failed to stage changes: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Commit staged changes and return commit hash
   */
  async commit(repoPath: string, options: GitCommitOptions): Promise<string> {
    try {
      const git = simpleGit(repoPath);

      // Set author if provided
      if (options.author) {
        await git.addConfig(
          "user.name",
          options.author.name,
          false,
          "local"
        );
        await git.addConfig(
          "user.email",
          options.author.email,
          false,
          "local"
        );
      }

      const result = await git.commit(options.message);
      return result.commit;
    } catch (error) {
      throw new Error(
        `Failed to commit changes: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Push branch to remote with optional authentication
   */
  async push(
    repoPath: string,
    branchName: string,
    token?: string
  ): Promise<void> {
    try {
      const git = simpleGit(repoPath);

      // If token provided, update remote URL to include authentication
      if (token) {
        const remoteUrl = await this.getRemoteUrl(repoPath);
        const authUrl = this.buildAuthenticatedUrl(remoteUrl, token);
        await git.remote(["set-url", "origin", authUrl]);
      }

      await git.push("origin", branchName, ["--set-upstream"]);
    } catch (error) {
      throw new Error(
        `Failed to push branch: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Get diff of all changes (staged and unstaged)
   */
  async getDiff(repoPath: string): Promise<string> {
    try {
      const git = simpleGit(repoPath);
      const diff = await git.diff();
      return diff;
    } catch (error) {
      throw new Error(
        `Failed to get diff: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Get repository status summary
   */
  async getStatus(repoPath: string): Promise<GitStatus> {
    try {
      const git = simpleGit(repoPath);
      const status: StatusResult = await git.status();

      return {
        staged: status.staged,
        modified: status.modified,
        untracked: status.not_added,
      };
    } catch (error) {
      throw new Error(
        `Failed to get status: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Build authenticated URL for GitHub
   * Converts https://github.com/owner/repo.git to https://token@github.com/owner/repo.git
   */
  private buildAuthenticatedUrl(url: string, token: string): string {
    try {
      const urlObj = new URL(url);
      urlObj.username = token;
      return urlObj.toString();
    } catch {
      // If URL parsing fails, try simple replacement for GitHub URLs
      if (url.includes("github.com")) {
        return url.replace("https://github.com", `https://${token}@github.com`);
      }
      throw new Error("Invalid repository URL");
    }
  }

  /**
   * Get remote URL for origin
   */
  private async getRemoteUrl(repoPath: string): Promise<string> {
    const git = simpleGit(repoPath);
    const remotes = await git.getRemotes(true);
    const origin = remotes.find((r: { name: string }) => r.name === "origin");

    if (!origin) {
      throw new Error("No origin remote found");
    }

    return origin.refs.push || origin.refs.fetch;
  }
}
