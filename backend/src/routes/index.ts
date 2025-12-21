import type { FastifyInstance } from "fastify";
import type { DrizzleDatabase } from "../db/index.js";
import { workItemRoutes } from "./work-items.js";
import { templateRoutes } from "./templates.js";
import { workerRoutes } from "./workers.js";
import { traceRoutes } from "./traces.js";

export interface RouteOptions {
  db: DrizzleDatabase;
}

/**
 * Register all API routes
 */
export async function registerRoutes(
  app: FastifyInstance,
  options: RouteOptions
) {
  const { db } = options;

  // Register route groups with prefixes
  await app.register(
    async (instance) => {
      await workItemRoutes(instance, { db });
    },
    { prefix: "/api/work-items" }
  );

  await app.register(
    async (instance) => {
      await templateRoutes(instance, { db });
    },
    { prefix: "/api/templates" }
  );

  await app.register(
    async (instance) => {
      await workerRoutes(instance, { db });
    },
    { prefix: "/api/workers" }
  );

  await app.register(
    async (instance) => {
      await traceRoutes(instance, { db });
    },
    { prefix: "/api/traces" }
  );
}
