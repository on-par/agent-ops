import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import type { DrizzleDatabase } from "../../../shared/db/index.js";
import { MetricsService } from "../services/metrics.service.js";
import {
  AgentMetricsQuerySchema,
  WorkMetricsQuerySchema,
} from "../schemas/metrics.schemas.js";
import { ZodError } from "zod";

export interface MetricsHandlerOptions extends FastifyPluginOptions {
  db: DrizzleDatabase;
  metricsService?: MetricsService;
}

/**
 * Metrics REST Routes
 * Provides APIs for retrieving metrics data for agents, work items, and system
 */
export async function metricsHandler(
  app: FastifyInstance,
  options: MetricsHandlerOptions
): Promise<void> {
  const { db } = options;

  // Initialize metrics service (or use injected one for testing)
  const metricsService = options.metricsService ?? new MetricsService(db);

  /**
   * Error handler helper
   * Centralizes error handling logic for consistent responses
   */
  const handleError = (error: unknown, reply: FastifyReply): void => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: "Invalid query parameters",
        details: (error as any).errors,
        statusCode: 400,
      });
      return;
    }

    if (error instanceof Error) {
      const message = error.message;

      // Internal server error
      reply.status(500).send({
        error: message,
        statusCode: 500,
      });
      return;
    }

    // Unknown error - rethrow
    throw error;
  };

  /**
   * GET /agents - Get agent/worker metrics
   * Query Parameters:
   *   - templateId?: string - Filter by template ID
   *   - status?: "active" | "idle" | "offline" - Filter by status
   *   - limit?: number - Pagination limit (default: 50)
   *   - offset?: number - Pagination offset (default: 0)
   */
  app.get("/agents", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = AgentMetricsQuerySchema.parse(request.query);
      const metrics = await metricsService.getAgentMetrics({
        ...(query.templateId && { templateId: query.templateId }),
        ...(query.status && { status: query.status }),
        limit: query.limit,
        offset: query.offset,
      });

      reply.send(metrics);
    } catch (error) {
      handleError(error, reply);
    }
  });

  /**
   * GET /work - Get work item metrics
   * Query Parameters:
   *   - startDate?: string - ISO 8601 start date
   *   - endDate?: string - ISO 8601 end date
   *   - type?: string - Filter by work item type
   */
  app.get("/work", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = WorkMetricsQuerySchema.parse(request.query);
      const metrics = await metricsService.getWorkMetrics({
        ...(query.startDate && { startDate: new Date(query.startDate) }),
        ...(query.endDate && { endDate: new Date(query.endDate) }),
        ...(query.type && { type: query.type }),
      });

      reply.send(metrics);
    } catch (error) {
      handleError(error, reply);
    }
  });

  /**
   * GET /system - Get system-wide metrics
   * No query parameters
   */
  app.get(
    "/system",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const metrics = await metricsService.getSystemMetrics();
        reply.send(metrics);
      } catch (error) {
        handleError(error, reply);
      }
    }
  );
}
