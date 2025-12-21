import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { Config } from "./config.js";

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

  await app.register(cors, {
    origin: config.isDevelopment ? true : false,
    credentials: true,
  });

  await app.register(websocket);

  app.get("/health", async () => {
    return { status: HEALTH_STATUS_OK };
  });

  return app;
}
