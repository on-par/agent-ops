import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { Octokit } from "octokit";
import { RepositoryRepository } from "../repositories/repository.repository.js";
import { GitHubConnectionRepository } from "../repositories/github-connection.repository.js";
import { GitHubSyncService } from "../services/github-sync.service.js";
import type { DrizzleDatabase } from "../db/index.js";

interface RepositoriesRoutesOptions extends FastifyPluginOptions {
  db: DrizzleDatabase;
}

export async function repositoriesRoutes(
  app: FastifyInstance,
  options: RepositoriesRoutesOptions
): Promise<void> {
  const { db } = options;
  const repoRepository = new RepositoryRepository(db);
  const connectionRepo = new GitHubConnectionRepository(db);
  const syncService = new GitHubSyncService(db);

  /**
   * GET /api/repositories
   * List all connected repositories
   */
  app.get("/", async (_request, reply) => {
    const repos = await repoRepository.findAll();

    return reply.send({
      repositories: repos.map((r) => ({
        id: r.id,
        fullName: r.fullName,
        owner: r.owner,
        name: r.name,
        description: r.description,
        htmlUrl: r.htmlUrl,
        defaultBranch: r.defaultBranch,
        isPrivate: r.isPrivate,
        syncEnabled: r.syncEnabled,
        syncStatus: r.syncStatus,
        syncError: r.syncError,
        lastSyncAt: r.lastSyncAt,
        createdAt: r.createdAt,
      })),
    });
  });

  /**
   * GET /api/repositories/:id
   * Get a specific repository
   */
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const repo = await repoRepository.findById(request.params.id);

    if (!repo) {
      return reply.status(404).send({
        error: "Not found",
        message: "Repository not found",
      });
    }

    return reply.send({ repository: repo });
  });

  /**
   * GET /api/repositories/available/:connectionId
   * List repositories available to connect from a GitHub connection
   */
  app.get<{ Params: { connectionId: string } }>(
    "/available/:connectionId",
    async (request, reply) => {
      const connection = await connectionRepo.findById(request.params.connectionId);

      if (!connection) {
        return reply.status(404).send({
          error: "Not found",
          message: "GitHub connection not found",
        });
      }

      try {
        const octokit = new Octokit({ auth: connection.accessToken });

        // Get repos the user has access to
        const { data: repos } = await octokit.rest.repos.listForAuthenticatedUser({
          sort: "updated",
          per_page: 100,
        });

        // Get already connected repo IDs
        const connectedRepos = await repoRepository.findByConnectionId(connection.id);
        const connectedIds = new Set(connectedRepos.map((r) => r.githubRepoId));

        return reply.send({
          repositories: repos.map((r) => ({
            id: r.id,
            fullName: r.full_name,
            owner: r.owner.login,
            name: r.name,
            description: r.description,
            htmlUrl: r.html_url,
            defaultBranch: r.default_branch,
            isPrivate: r.private,
            isConnected: connectedIds.has(r.id),
          })),
        });
      } catch (err) {
        request.log.error({ err }, "Failed to list GitHub repositories");
        return reply.status(500).send({
          error: "GitHub API error",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  );

  /**
   * POST /api/repositories
   * Connect a new repository
   */
  app.post<{
    Body: {
      connectionId: string;
      githubRepoId: number;
      syncEnabled?: boolean;
      issueLabelsFilter?: string[];
      autoAssignAgents?: boolean;
    };
  }>("/", async (request, reply) => {
    const { connectionId, githubRepoId, syncEnabled, issueLabelsFilter, autoAssignAgents } =
      request.body;

    // Validate connection exists
    const connection = await connectionRepo.findById(connectionId);
    if (!connection) {
      return reply.status(400).send({
        error: "Invalid connection",
        message: "GitHub connection not found",
      });
    }

    // Check if already connected
    const existing = await repoRepository.findByGitHubRepoId(githubRepoId);
    if (existing) {
      return reply.status(409).send({
        error: "Already connected",
        message: "This repository is already connected",
        repository: existing,
      });
    }

    try {
      // Fetch repo details from GitHub
      const octokit = new Octokit({ auth: connection.accessToken });
      const { data: ghRepo } = await octokit.rest.repos.get({
        owner: "", // Will be filled by repo_id lookup
        repo: "",
        headers: { Accept: "application/vnd.github.v3+json" },
      }).catch(async () => {
        // Fallback: list repos and find by ID
        const { data: repos } = await octokit.rest.repos.listForAuthenticatedUser({
          per_page: 100,
        });
        const found = repos.find((r) => r.id === githubRepoId);
        if (!found) {
          throw new Error("Repository not found or not accessible");
        }
        return { data: found };
      });

      // Create repository connection
      const repo = await repoRepository.create({
        connectionId,
        githubRepoId: ghRepo.id,
        owner: ghRepo.owner.login,
        name: ghRepo.name,
        fullName: ghRepo.full_name,
        htmlUrl: ghRepo.html_url,
        description: ghRepo.description ?? null,
        defaultBranch: ghRepo.default_branch ?? "main",
        isPrivate: ghRepo.private,
        syncEnabled: syncEnabled ?? true,
        issueLabelsFilter: issueLabelsFilter ?? [],
        autoAssignAgents: autoAssignAgents ?? false,
      });

      request.log.info(
        { repoId: repo.id, fullName: repo.fullName },
        "Repository connected"
      );

      return reply.status(201).send({ repository: repo });
    } catch (err) {
      request.log.error({ err }, "Failed to connect repository");
      return reply.status(500).send({
        error: "Failed to connect repository",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * PATCH /api/repositories/:id
   * Update repository settings
   */
  app.patch<{
    Params: { id: string };
    Body: {
      syncEnabled?: boolean;
      issueLabelsFilter?: string[];
      autoAssignAgents?: boolean;
    };
  }>("/:id", async (request, reply) => {
    const repo = await repoRepository.findById(request.params.id);

    if (!repo) {
      return reply.status(404).send({
        error: "Not found",
        message: "Repository not found",
      });
    }

    const { syncEnabled, issueLabelsFilter, autoAssignAgents } = request.body;

    const updateData: Parameters<typeof repoRepository.update>[1] = {};
    if (syncEnabled !== undefined) {
      updateData.syncEnabled = syncEnabled;
    }
    if (issueLabelsFilter !== undefined) {
      updateData.issueLabelsFilter = issueLabelsFilter;
    }
    if (autoAssignAgents !== undefined) {
      updateData.autoAssignAgents = autoAssignAgents;
    }

    const updated = await repoRepository.update(repo.id, updateData);

    return reply.send({ repository: updated });
  });

  /**
   * DELETE /api/repositories/:id
   * Disconnect a repository
   */
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const repo = await repoRepository.findById(request.params.id);

    if (!repo) {
      return reply.status(404).send({
        error: "Not found",
        message: "Repository not found",
      });
    }

    await repoRepository.delete(repo.id);

    request.log.info(
      { repoId: repo.id, fullName: repo.fullName },
      "Repository disconnected"
    );

    return reply.status(204).send();
  });

  /**
   * POST /api/repositories/:id/sync
   * Trigger a sync for a repository
   */
  app.post<{ Params: { id: string } }>("/:id/sync", async (request, reply) => {
    const repo = await repoRepository.findById(request.params.id);

    if (!repo) {
      return reply.status(404).send({
        error: "Not found",
        message: "Repository not found",
      });
    }

    if (!repo.syncEnabled) {
      return reply.status(400).send({
        error: "Sync disabled",
        message: "Sync is disabled for this repository",
      });
    }

    try {
      const result = await syncService.syncRepository(repo.id);

      request.log.info(
        { repoId: repo.id, fullName: repo.fullName, ...result },
        "Sync completed"
      );

      return reply.send({
        message: "Sync completed",
        result,
        repository: await repoRepository.findById(repo.id),
      });
    } catch (err) {
      request.log.error({ err, repoId: repo.id }, "Sync failed");
      return reply.status(500).send({
        error: "Sync failed",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * POST /api/repositories/sync-all
   * Trigger sync for all enabled repositories
   */
  app.post("/sync-all", async (request, reply) => {
    try {
      const results = await syncService.syncAllRepositories();

      const summary = {
        total: results.size,
        successful: 0,
        failed: 0,
        details: [] as Array<{ repoId: string; created: number; updated: number; errors: string[] }>,
      };

      for (const [repoId, result] of results) {
        if (result.errors.length === 0) {
          summary.successful++;
        } else {
          summary.failed++;
        }
        summary.details.push({ repoId, ...result });
      }

      request.log.info(summary, "Sync all completed");

      return reply.send({
        message: "Sync all completed",
        summary,
      });
    } catch (err) {
      request.log.error({ err }, "Sync all failed");
      return reply.status(500).send({
        error: "Sync all failed",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });
}
