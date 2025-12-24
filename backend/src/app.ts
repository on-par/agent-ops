import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { Config } from "./config.js";
import type { DrizzleDatabase } from "./db/index.js";
import { WorkItemRepository } from "./features/work-items/repositories/work-item.repository.js";
import { WorkItemService } from "./features/work-items/services/work-item.service.js";
import { ConcurrencyLimitsService } from "./features/orchestration/services/orchestration.service.js";
import { workItemsHandler } from "./features/work-items/handler/work-items.handler.js";
import { githubAuthHandler } from "./features/github/handler/github-auth.handler.js";
import { githubWebhookHandler } from "./features/github/handler/github-webhook.handler.js";
import { GitHubService } from "./features/github/services/github.service.js";
import { GitHubWebhookService } from "./features/github/services/github-webhook.service.js";
import { GitHubConnectionRepository } from "./features/github/repositories/github-connection.repository.js";
import { repositoriesRoutes } from "./features/repositories/handler/repositories.handler.js";
import { pullRequestsHandler } from "./features/pull-requests/handler/pull-requests.handler.js";
import { agentRuntimeRoutes } from "./features/agent-runtime/handler/agent-runtime.handler.js";
import { concurrencyHandler } from "./features/concurrency/handler/concurrency.handler.js";

const HEALTH_STATUS_OK = "ok";

export interface AppOptions {
  config: Config;
  db?: DrizzleDatabase;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { config, db } = options;

  const app = Fastify({
    logger: config.isDevelopment
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              translateTime: "HH:MM:ss Z",
              ignore: "pid,hostname",
            },
          },
        }
      : true,
  });

  await app.register(cors, {
    origin: config.isDevelopment ? true : false,
    credentials: true,
  });

  await app.register(websocket);

  app.get("/health", async () => {
    return { status: HEALTH_STATUS_OK };
  });

  // Register routes if database is provided
  if (db) {
    const workItemRepository = new WorkItemRepository(db);
    const workItemService = new WorkItemService(workItemRepository);
    await app.register(workItemsHandler, {
      prefix: "/api/work-items",
      service: workItemService,
    });

    // GitHub feature handlers
    const githubService = new GitHubService(config);
    const connectionRepo = new GitHubConnectionRepository(db);
    const webhookService = new GitHubWebhookService(db, config.githubWebhookSecret);

    // GitHub OAuth routes
    await app.register(githubAuthHandler, {
      prefix: "/api/auth/github",
      config,
      githubService,
      connectionRepo,
    });

    // GitHub webhook routes
    await app.register(githubWebhookHandler, {
      prefix: "/api/webhooks/github",
      config,
      webhookService,
    });

    // Repository management routes
    await app.register(repositoriesRoutes, {
      prefix: "/api/repositories",
      db,
    });

    // Pull request routes
    await app.register(pullRequestsHandler, {
      prefix: "/api/pull-requests",
      db,
    });

    // Agent runtime routes
    await app.register(agentRuntimeRoutes, {
      prefix: "/api/agent-runtime",
      db,
      config,
    });

    // Concurrency limits handler (em3.5)
    const concurrencyService = new ConcurrencyLimitsService({
      maxGlobalWorkers: config.maxGlobalWorkers,
      maxWorkersPerRepo: config.maxWorkersPerRepo,
      maxWorkersPerUser: config.maxWorkersPerUser,
    });
    await app.register(concurrencyHandler, {
      prefix: "/api/concurrency",
      concurrencyService,
    });
  }

  return app;
}
