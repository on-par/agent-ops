import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import { randomBytes } from "crypto";
import type { GitHubService } from "../services/github.service.js";
import type { GitHubConnectionRepository } from "../repositories/github-connection.repository.js";
import type { Config } from "../../../shared/config.js";

export interface GitHubAuthHandlerOptions extends FastifyPluginOptions {
  config: Config;
  githubService: GitHubService;
  connectionRepo: GitHubConnectionRepository;
}

// In-memory state store for CSRF protection (use Redis in production)
const stateStore = new Map<string, { createdAt: number; redirectUrl: string | null }>();
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function cleanupExpiredStates(): void {
  const now = Date.now();
  for (const [state, data] of stateStore) {
    if (now - data.createdAt > STATE_TTL_MS) {
      stateStore.delete(state);
    }
  }
}

/**
 * GitHub OAuth Handler
 * Provides authentication and connection management for GitHub
 */
export async function githubAuthHandler(
  app: FastifyInstance,
  options: GitHubAuthHandlerOptions
): Promise<void> {
  const { config, githubService, connectionRepo } = options;

  // Cleanup expired states periodically
  setInterval(cleanupExpiredStates, 60 * 1000);

  /**
   * GET /api/auth/github
   * Initiate GitHub OAuth flow
   */
  app.get<{
    Querystring: { redirect?: string };
  }>("/", async (request, reply) => {
    if (!config.githubClientId) {
      return reply.status(500).send({
        error: "GitHub OAuth not configured",
        message: "GITHUB_CLIENT_ID environment variable is not set",
      });
    }

    // Generate CSRF state token
    const state = randomBytes(32).toString("hex");
    stateStore.set(state, {
      createdAt: Date.now(),
      redirectUrl: request.query.redirect ?? null,
    });

    const authUrl = githubService.getAuthorizationUrl(state);
    return reply.redirect(authUrl);
  });

  /**
   * GET /api/auth/github/callback
   * Handle GitHub OAuth callback
   */
  app.get<{
    Querystring: { code?: string; state?: string; error?: string; error_description?: string };
  }>("/callback", async (request, reply) => {
    const { code, state, error, error_description } = request.query;

    // Handle OAuth errors from GitHub
    if (error) {
      request.log.error({ error, error_description }, "GitHub OAuth error");
      return reply.status(400).send({
        error: "GitHub OAuth failed",
        message: error_description || error,
      });
    }

    // Validate required params
    if (!code || !state) {
      return reply.status(400).send({
        error: "Invalid callback",
        message: "Missing code or state parameter",
      });
    }

    // Validate state (CSRF protection)
    const stateData = stateStore.get(state);
    if (!stateData) {
      return reply.status(400).send({
        error: "Invalid state",
        message: "State token expired or invalid. Please try again.",
      });
    }
    stateStore.delete(state);

    try {
      // Complete OAuth flow
      const authResult = await githubService.completeOAuthFlow(code);

      // Store or update connection
      const connection = await connectionRepo.upsert({
        githubUserId: authResult.user.id,
        githubUsername: authResult.user.login,
        githubAvatarUrl: authResult.user.avatar_url,
        accessToken: authResult.accessToken,
        refreshToken: authResult.refreshToken ?? null,
        tokenExpiresAt: authResult.expiresAt ?? null,
        scopes: authResult.scopes,
      });

      request.log.info(
        { username: authResult.user.login, connectionId: connection.id },
        "GitHub OAuth successful"
      );

      // Redirect to frontend or return JSON
      if (stateData.redirectUrl) {
        const redirectUrl = new URL(stateData.redirectUrl);
        redirectUrl.searchParams.set("connection_id", connection.id);
        return reply.redirect(redirectUrl.toString());
      }

      return reply.send({
        success: true,
        connection: {
          id: connection.id,
          username: connection.githubUsername,
          avatarUrl: connection.githubAvatarUrl,
          scopes: connection.scopes,
        },
      });
    } catch (err) {
      request.log.error({ err }, "GitHub OAuth callback failed");
      return reply.status(500).send({
        error: "OAuth failed",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  /**
   * GET /api/auth/github/connections
   * List all GitHub connections
   */
  app.get("/connections", async (_request, reply) => {
    const connections = await connectionRepo.findAll();

    return reply.send({
      connections: connections.map((c) => ({
        id: c.id,
        username: c.githubUsername,
        avatarUrl: c.githubAvatarUrl,
        scopes: c.scopes,
        createdAt: c.createdAt,
      })),
    });
  });

  /**
   * GET /api/auth/github/connections/:id
   * Get a specific connection
   */
  app.get<{ Params: { id: string } }>("/connections/:id", async (request, reply) => {
    const connection = await connectionRepo.findById(request.params.id);

    if (!connection) {
      return reply.status(404).send({
        error: "Not found",
        message: "GitHub connection not found",
      });
    }

    // Verify token is still valid
    const isValid = await githubService.verifyToken(connection.accessToken);

    return reply.send({
      connection: {
        id: connection.id,
        username: connection.githubUsername,
        avatarUrl: connection.githubAvatarUrl,
        scopes: connection.scopes,
        isValid,
        createdAt: connection.createdAt,
      },
    });
  });

  /**
   * DELETE /api/auth/github/connections/:id
   * Revoke a GitHub connection
   */
  app.delete<{ Params: { id: string } }>("/connections/:id", async (request, reply) => {
    const connection = await connectionRepo.findById(request.params.id);

    if (!connection) {
      return reply.status(404).send({
        error: "Not found",
        message: "GitHub connection not found",
      });
    }

    await connectionRepo.delete(connection.id);

    request.log.info(
      { username: connection.githubUsername, connectionId: connection.id },
      "GitHub connection deleted"
    );

    return reply.status(204).send();
  });
}
