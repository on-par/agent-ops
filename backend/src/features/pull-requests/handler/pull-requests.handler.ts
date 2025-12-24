import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { GitHubPRService } from "../services/github-pr.service.js";
import type { DrizzleDatabase } from "../../../db/index.js";

interface PullRequestsHandlerOptions extends FastifyPluginOptions {
  db: DrizzleDatabase;
}

export async function pullRequestsHandler(
  app: FastifyInstance,
  options: PullRequestsHandlerOptions
): Promise<void> {
  const { db } = options;
  const prService = new GitHubPRService(db);

  /**
   * POST /api/pull-requests
   * Create a pull request from agent work
   */
  app.post<{
    Body: {
      workItemId: string;
      branchName: string;
      title: string;
      body: string;
      baseBranch?: string;
      draft?: boolean;
    };
  }>("/", async (request, reply) => {
    const { workItemId, branchName, title, body, baseBranch, draft } = request.body;

    if (!workItemId || !branchName || !title) {
      return reply.status(400).send({
        error: "Missing required fields",
        message: "workItemId, branchName, and title are required",
      });
    }

    try {
      const pr = await prService.createPullRequest({
        workItemId,
        branchName,
        title,
        body,
        baseBranch,
        draft,
      });

      request.log.info(
        { workItemId, prNumber: pr.number, htmlUrl: pr.htmlUrl },
        "Pull request created"
      );

      return reply.status(201).send({ pullRequest: pr });
    } catch (err) {
      request.log.error({ err, workItemId }, "Failed to create pull request");
      return reply.status(500).send({
        error: "Failed to create pull request",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * GET /api/pull-requests/:repositoryId/:prNumber
   * Get pull request status
   */
  app.get<{
    Params: { repositoryId: string; prNumber: string };
  }>("/:repositoryId/:prNumber", async (request, reply) => {
    const { repositoryId, prNumber } = request.params;
    const prNum = parseInt(prNumber, 10);

    if (isNaN(prNum)) {
      return reply.status(400).send({
        error: "Invalid PR number",
        message: "prNumber must be a valid integer",
      });
    }

    try {
      const status = await prService.getPullRequestStatus(repositoryId, prNum);
      return reply.send({ pullRequest: status });
    } catch (err) {
      request.log.error({ err, repositoryId, prNumber }, "Failed to get PR status");
      return reply.status(500).send({
        error: "Failed to get pull request",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * POST /api/pull-requests/branches
   * Create a branch for agent work
   */
  app.post<{
    Body: {
      repositoryId: string;
      branchName: string;
      fromBranch?: string;
    };
  }>("/branches", async (request, reply) => {
    const { repositoryId, branchName, fromBranch } = request.body;

    if (!repositoryId || !branchName) {
      return reply.status(400).send({
        error: "Missing required fields",
        message: "repositoryId and branchName are required",
      });
    }

    try {
      const branch = await prService.createBranch(repositoryId, branchName, fromBranch);

      request.log.info(
        { repositoryId, branchName, sha: branch.sha },
        "Branch created"
      );

      return reply.status(201).send({ branch });
    } catch (err) {
      request.log.error({ err, repositoryId, branchName }, "Failed to create branch");
      return reply.status(500).send({
        error: "Failed to create branch",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * POST /api/pull-requests/:repositoryId/:prNumber/reviews
   * Request reviews for a PR
   */
  app.post<{
    Params: { repositoryId: string; prNumber: string };
    Body: { reviewers: string[] };
  }>("/:repositoryId/:prNumber/reviews", async (request, reply) => {
    const { repositoryId, prNumber } = request.params;
    const { reviewers } = request.body;
    const prNum = parseInt(prNumber, 10);

    if (isNaN(prNum)) {
      return reply.status(400).send({
        error: "Invalid PR number",
        message: "prNumber must be a valid integer",
      });
    }

    if (!reviewers || reviewers.length === 0) {
      return reply.status(400).send({
        error: "Missing reviewers",
        message: "At least one reviewer is required",
      });
    }

    try {
      await prService.requestReviews(repositoryId, prNum, reviewers);
      return reply.send({ message: "Reviews requested", reviewers });
    } catch (err) {
      request.log.error({ err, repositoryId, prNumber }, "Failed to request reviews");
      return reply.status(500).send({
        error: "Failed to request reviews",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * POST /api/pull-requests/:repositoryId/:prNumber/merge
   * Merge a pull request
   */
  app.post<{
    Params: { repositoryId: string; prNumber: string };
    Body: { mergeMethod?: "merge" | "squash" | "rebase" };
  }>("/:repositoryId/:prNumber/merge", async (request, reply) => {
    const { repositoryId, prNumber } = request.params;
    const { mergeMethod } = request.body;
    const prNum = parseInt(prNumber, 10);

    if (isNaN(prNum)) {
      return reply.status(400).send({
        error: "Invalid PR number",
        message: "prNumber must be a valid integer",
      });
    }

    try {
      const result = await prService.mergePullRequest(
        repositoryId,
        prNum,
        mergeMethod ?? "squash"
      );

      if (result.merged) {
        request.log.info({ repositoryId, prNumber }, "Pull request merged");
        return reply.send({ success: true, ...result });
      } else {
        return reply.status(400).send({
          success: false,
          error: "Merge failed",
          message: result.message,
        });
      }
    } catch (err) {
      request.log.error({ err, repositoryId, prNumber }, "Failed to merge PR");
      return reply.status(500).send({
        error: "Failed to merge pull request",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * GET /api/pull-requests/generate-branch-name/:workItemId
   * Generate a branch name for a work item
   */
  app.get<{
    Params: { workItemId: string };
    Querystring: { prefix?: string };
  }>("/generate-branch-name/:workItemId", async (request, reply) => {
    const { workItemId } = request.params;
    const { prefix } = request.query;

    const branchName = prService.generateBranchName(workItemId, prefix ?? "agent");

    return reply.send({ branchName });
  });
}
