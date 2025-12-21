import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { Config } from "./config.js";
import { createDatabase } from "./db/index.js";
import websocketPlugin from "./plugins/websocket.js";
import wsRoutes from "./routes/ws.js";
import { registerRoutes } from "./routes/index.js";

const HEALTH_STATUS_OK = "ok";

export interface AppOptions {
  config: Config;
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { config } = options;

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

  // Initialize database
  const { db, sqlite } = createDatabase({ url: config.databaseUrl });

  // Register CORS
  await app.register(cors, {
    origin: config.isDevelopment ? true : false,
    credentials: true,
  });

  // Register WebSocket support
  await app.register(websocket);

  // Register custom WebSocket plugin
  await app.register(websocketPlugin);

  // Register WebSocket routes
  await app.register(wsRoutes, { db });

  // Health check endpoint
  app.get("/health", async () => {
    return { status: HEALTH_STATUS_OK };
  });

  // Register REST API routes
  await registerRoutes(app, { db });

  // Cleanup on close
  app.addHook("onClose", async () => {
    sqlite.close();
  });

  return app;
}
