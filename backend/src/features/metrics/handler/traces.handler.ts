import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import type { DrizzleDatabase } from "../../../shared/db/index.js";
import { MetricsService } from "../services/metrics.service.js";
import { TracesQuerySchema } from "../schemas/metrics.schemas.js";
import { ZodError } from "zod";

export interface TracesHandlerOptions extends FastifyPluginOptions {
  db: DrizzleDatabase;
  metricsService?: MetricsService;
}

/**
 * Traces REST Routes
 * Provides APIs for retrieving trace data
 */
export async function tracesHandler(
  app: FastifyInstance,
  options: TracesHandlerOptions
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
   * GET / - Get traces with optional filtering
   * Query Parameters:
   *   - workerId?: string - Filter by worker ID
   *   - workItemId?: string - Filter by work item ID
   *   - eventType?: string - Filter by event type
   *   - startTime?: string - ISO 8601 start time
   *   - endTime?: string - ISO 8601 end time
   *   - limit?: number - Pagination limit (default: 100)
   *   - offset?: number - Pagination offset (default: 0)
   */
  app.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = TracesQuerySchema.parse(request.query);
      const traces = await metricsService.getTraces({
        ...(query.workerId && { workerId: query.workerId }),
        ...(query.workItemId && { workItemId: query.workItemId }),
        ...(query.eventType && { eventType: query.eventType }),
        ...(query.startTime && { startTime: new Date(query.startTime) }),
        ...(query.endTime && { endTime: new Date(query.endTime) }),
        limit: query.limit,
        offset: query.offset,
      });

      reply.send(traces);
    } catch (error) {
      handleError(error, reply);
    }
  });
}
