import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import type { DrizzleDatabase } from "../../../shared/db/index.js";
import type { Config } from "../../../shared/config.js";
import { ContainerManagerService } from "../services/container-manager.service.js";
import BetterSSE from "better-sse";
const { createSession } = BetterSSE;
import { logsQuerySchema } from "../schemas/container.schemas.js";
import { ZodError } from "zod";
import { parseLogLine } from "../utils/log-parser.js";
import type { ContainerLogOptions } from "../types/container.types.js";

export interface ContainerLogsHandlerOptions extends FastifyPluginOptions {
  db: DrizzleDatabase;
  config: Config;
  containerService?: ContainerManagerService;
}

/**
 * Container Logs SSE Routes
 * Provides SSE endpoint for streaming container logs
 */
export async function containerLogsRoutes(
  app: FastifyInstance,
  options: ContainerLogsHandlerOptions
): Promise<void> {
  const { db } = options;

  // Initialize container manager service (or use injected one for testing)
  const containerService = options.containerService ?? new ContainerManagerService(db);

  /**
   * GET /:id/logs/stream - Stream container logs as structured JSON via Server-Sent Events (SSE)
   * Query params: follow (boolean), tail (number), timestamps (boolean)
   * Returns: SSE stream of structured log events with timestamp, level, and message
   *
   * Events:
   * - 'log': { timestamp: string, level: 'info'|'warn'|'error'|'debug', message: string }
   * - 'container-stopped': { exitCode?: number }
   * - 'error': { message: string }
   */
  app.get("/:id/logs/stream", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      // Check if container exists
      const container = await containerService.getContainerStatus(id);
      if (!container) {
        reply.status(404).send({
          error: "Container not found",
          statusCode: 404,
        });
        return;
      }

      // Validate query parameters
      let queryParams;
      try {
        queryParams = logsQuerySchema.parse(request.query);
      } catch (error) {
        if (error instanceof ZodError) {
          reply.status(400).send({
            error: "Invalid query parameters",
            details: error.issues,
            statusCode: 400,
          });
          return;
        }
        throw error;
      }

      // Create SSE session
      const session = await createSession(request.raw, reply.raw);

      // Get log stream from container service
      const logOptions: ContainerLogOptions = {};
      if (queryParams.follow !== undefined) {
        logOptions.follow = queryParams.follow;
      }
      if (queryParams.tail !== undefined) {
        logOptions.tail = queryParams.tail;
      }
      if (queryParams.timestamps !== undefined) {
        logOptions.timestamps = queryParams.timestamps;
      }
      const logStream = await containerService.getLogs(container.id, logOptions);

      // Stream logs as structured JSON SSE events
      logStream.on("data", (chunk: Buffer) => {
        const logLine = chunk.toString().trim();
        const parsed = parseLogLine(logLine, logOptions.timestamps ?? false);

        if (parsed) {
          session.push(parsed, "log");
        }
      });

      logStream.on("end", () => {
        session.push({ exitCode: 0 }, "container-stopped");
      });

      logStream.on("error", (error: Error) => {
        session.push(
          { message: error.message },
          "error"
        );
      });

      // Handle client disconnect
      request.raw.on("close", () => {
        logStream.destroy();
      });

    } catch (error) {
      if (!reply.sent) {
        if (error instanceof Error) {
          const message = error.message;

          // Check if it's a "not found" error
          if (message.includes("not found")) {
            reply.status(404).send({
              error: "Container not found",
              statusCode: 404,
            });
            return;
          }

          // Internal server error
          reply.status(500).send({
            error: message,
            statusCode: 500,
          });
          return;
        }

        // Unknown error - rethrow
        throw error;
      }
    }
  });

  /**
   * GET /:id/logs - Stream container logs via Server-Sent Events (SSE)
   * Query params: follow (boolean), tail (number), timestamps (boolean)
   * Returns: SSE stream of raw log events (plain text)
   */
  app.get("/:id/logs", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      // Check if container exists
      const container = await containerService.getContainerStatus(id);
      if (!container) {
        reply.status(404).send({
          error: "Container not found",
          statusCode: 404,
        });
        return;
      }

      // Validate query parameters
      let queryParams;
      try {
        queryParams = logsQuerySchema.parse(request.query);
      } catch (error) {
        if (error instanceof ZodError) {
          reply.status(400).send({
            error: "Invalid query parameters",
            details: error.issues,
            statusCode: 400,
          });
          return;
        }
        throw error;
      }

      // Create SSE session
      const session = await createSession(request.raw, reply.raw);

      // Get log stream from container service
      const logOptions: ContainerLogOptions = {};
      if (queryParams.follow !== undefined) {
        logOptions.follow = queryParams.follow;
      }
      if (queryParams.tail !== undefined) {
        logOptions.tail = queryParams.tail;
      }
      if (queryParams.timestamps !== undefined) {
        logOptions.timestamps = queryParams.timestamps;
      }
      const logStream = await containerService.getLogs(container.id, logOptions);

      // Stream logs as SSE events
      logStream.on("data", (chunk: Buffer) => {
        const logLine = chunk.toString().trim();
        if (logLine) {
          session.push(logLine, "log");
        }
      });

      logStream.on("end", () => {
        session.push(null, "end");
      });

      logStream.on("error", (error: Error) => {
        session.push(
          JSON.stringify({ error: error.message }),
          "error"
        );
      });

      // Handle client disconnect
      request.raw.on("close", () => {
        logStream.destroy();
      });

    } catch (error) {
      if (!reply.sent) {
        if (error instanceof Error) {
          const message = error.message;

          // Check if it's a "not found" error
          if (message.includes("not found")) {
            reply.status(404).send({
              error: "Container not found",
              statusCode: 404,
            });
            return;
          }

          // Internal server error
          reply.status(500).send({
            error: message,
            statusCode: 500,
          });
          return;
        }

        // Unknown error - rethrow
        throw error;
      }
    }
  });
}
