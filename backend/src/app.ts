import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { Config } from "./shared/config.js";
import type { DrizzleDatabase } from "./shared/db/index.js";
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
import { containerRoutes } from "./features/containers/handler/container.handler.js";
import { containerLogsRoutes } from "./features/containers/handler/container-logs.handler.js";
import { containerTerminalHandler } from "./features/containers/handler/container-terminal.handler.js";
import { dashboardHandler } from "./features/dashboard/handler/dashboard.handler.js";
import { executionsHandler } from "./features/executions/handler/executions.handler.js";
import { websocketHandler } from "./features/dashboard/handler/websocket.handler.js";
import { WebSocketHubService } from "./shared/websocket/websocket-hub.service.js";
import { providerSettingsHandler } from "./features/llm-providers/handler/provider-settings.handler.js";
import { workersHandler } from "./features/workers/handler/workers.handler.js";
import { WorkerRepository } from "./features/workers/repositories/worker.repository.js";
import { WorkerPoolService } from "./features/workers/services/worker-pool.service.js";
import { templatesHandler } from "./features/templates/handler/templates.handler.js";
import { TemplateRepository } from "./features/templates/repositories/template.repository.js";
import { TemplateRegistryService } from "./features/templates/services/template-registry.service.js";
import { metricsHandler } from "./features/metrics/handler/metrics.handler.js";
import { tracesHandler } from "./features/metrics/handler/traces.handler.js";

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

  // Create WebSocket hub service for real-time communication
  const hubService = new WebSocketHubService();

  // Register WebSocket handler for real-time dashboard updates
  await app.register(websocketHandler, {
    prefix: "/api/dashboard",
    hubService,
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

    // Container management routes
    await app.register(containerRoutes, {
      prefix: "/api/containers",
      db,
      config,
    });

    // Container logs SSE routes
    await app.register(containerLogsRoutes, {
      prefix: "/api/containers",
      db,
      config,
    });

    // Container terminal WebSocket routes
    await app.register(containerTerminalHandler, {
      prefix: "/api/containers",
      db,
      config,
    });

    // Dashboard statistics routes
    await app.register(dashboardHandler, {
      prefix: "/api/dashboard",
      db,
    });

    // Execution logs routes
    await app.register(executionsHandler, {
      prefix: "/api/executions",
      db,
    });

    // LLM Provider settings routes
    await app.register(providerSettingsHandler, {
      prefix: "/api/provider-settings",
      db,
    });

    // Templates registry routes
    const templateRepository = new TemplateRepository(db);
    const templateService = new TemplateRegistryService(templateRepository);
    await app.register(templatesHandler, {
      prefix: "/api/templates",
      templateService,
    });

    // Worker pool routes
    const workerRepository = new WorkerRepository(db);
    const workerPoolService = new WorkerPoolService(workerRepository);
    await app.register(workersHandler, {
      prefix: "/api/workers",
      workerPoolService,
    });

    // Metrics routes
    await app.register(metricsHandler, {
      prefix: "/api/metrics",
      db,
    });

    // Traces routes (separate from metrics)
    await app.register(tracesHandler, {
      prefix: "/api/traces",
      db,
    });
  }

  return app;
}
