import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { Config } from "./config.js";
import type { DrizzleDatabase } from "./db/index.js";
import { WorkItemRepository } from "./repositories/work-item.repository.js";
import { WorkItemService } from "./services/work-item.service.js";
import { ConcurrencyLimitsService } from "./services/orchestration.service.js";
import { workItemsRoutes } from "./routes/work-items.routes.js";
import { githubAuthRoutes } from "./routes/github-auth.routes.js";
import { githubWebhookRoutes } from "./routes/github-webhook.routes.js";
import { repositoriesRoutes } from "./routes/repositories.routes.js";
import { pullRequestsRoutes } from "./routes/pull-requests.routes.js";
import { agentRuntimeRoutes } from "./routes/agent-runtime.routes.js";
import { concurrencyRoutes } from "./routes/concurrency.routes.js";

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
    await app.register(workItemsRoutes, {
      prefix: "/api/work-items",
      service: workItemService,
    });

    // GitHub OAuth routes
    await app.register(githubAuthRoutes, {
      prefix: "/api/auth/github",
      config,
      db,
    });

    // GitHub webhook routes
    await app.register(githubWebhookRoutes, {
      prefix: "/api/webhooks/github",
      config,
      db,
    });

    // Repository management routes
    await app.register(repositoriesRoutes, {
      prefix: "/api/repositories",
      db,
    });

    // Pull request routes
    await app.register(pullRequestsRoutes, {
      prefix: "/api/pull-requests",
      db,
    });

    // Agent runtime routes
    await app.register(agentRuntimeRoutes, {
      prefix: "/api/agent-runtime",
      db,
      config,
    });

    // Concurrency limits routes (em3.5)
    const concurrencyService = new ConcurrencyLimitsService({
      maxGlobalWorkers: config.maxGlobalWorkers,
      maxWorkersPerRepo: config.maxWorkersPerRepo,
      maxWorkersPerUser: config.maxWorkersPerUser,
    });
    await app.register(concurrencyRoutes, {
      prefix: "/api/concurrency",
      concurrencyService,
    });
  }

  return app;
}
