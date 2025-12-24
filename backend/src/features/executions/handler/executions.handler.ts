import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import type { DrizzleDatabase } from "../../../shared/db/index.js";
import { ExecutionLogService } from "../services/execution-log.service.js";
import type { ExecutionFilters, TraceFilters } from "../types/execution-log.types.js";
import type { AgentExecutionStatus, TraceEventType } from "../../../shared/db/schema.js";

export interface ExecutionsHandlerOptions extends FastifyPluginOptions {
  db: DrizzleDatabase;
}

/**
 * Executions REST Routes
 * Provides APIs for fetching execution logs and traces
 */
export async function executionsHandler(
  app: FastifyInstance,
  options: ExecutionsHandlerOptions
): Promise<void> {
  const { db } = options;

  // Initialize execution log service
  const executionService = new ExecutionLogService(db);

  // Error handler helper
  const handleError = (error: unknown, reply: FastifyReply): void => {
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
   * GET / - Get paginated list of executions
   * Query params: status, workerId, workItemId, dateFrom, dateTo, limit, offset
   * Returns: ExecutionListResponse with items, total, and hasMore
   */
  app.get("/", async (request, reply) => {
    try {
      const {
        status,
        workerId,
        workItemId,
        dateFrom,
        dateTo,
        limit,
        offset,
      } = request.query as {
        status?: AgentExecutionStatus;
        workerId?: string;
        workItemId?: string;
        dateFrom?: string;
        dateTo?: string;
        limit?: string;
        offset?: string;
      };

      // Parse filters
      const filters: ExecutionFilters = {};

      if (status) {
        filters.status = status;
      }

      if (workerId) {
        filters.workerId = workerId;
      }

      if (workItemId) {
        filters.workItemId = workItemId;
      }

      if (dateFrom) {
        filters.dateFrom = new Date(dateFrom);
      }

      if (dateTo) {
        filters.dateTo = new Date(dateTo);
      }

      if (limit) {
        filters.limit = parseInt(limit, 10);
      }

      if (offset) {
        filters.offset = parseInt(offset, 10);
      }

      const result = await executionService.getExecutionList(filters);

      reply.send(result);
    } catch (error) {
      handleError(error, reply);
    }
  });

  /**
   * GET /:id - Get execution detail with traces
   * Returns: ExecutionDetail or 404 if not found
   */
  app.get("/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const execution = await executionService.getExecutionById(id);

      if (!execution) {
        reply.status(404).send({
          error: "Execution not found",
          statusCode: 404,
        });
        return;
      }

      reply.send(execution);
    } catch (error) {
      handleError(error, reply);
    }
  });

  /**
   * GET /:id/traces - Get traces for an execution
   * Query params: eventType
   * Returns: Array of TraceEvent
   */
  app.get("/:id/traces", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { eventType } = request.query as { eventType?: TraceEventType };

      const filters: TraceFilters = {};

      if (eventType) {
        filters.eventType = eventType;
      }

      const traces = await executionService.getTracesByExecutionId(id, filters);

      reply.send(traces);
    } catch (error) {
      handleError(error, reply);
    }
  });
}
