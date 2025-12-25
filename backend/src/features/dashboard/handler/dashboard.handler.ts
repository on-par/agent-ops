import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import type { DrizzleDatabase } from "../../../shared/db/index.js";
import { DashboardService } from "../services/dashboard.service.js";

export interface DashboardHandlerOptions extends FastifyPluginOptions {
  db: DrizzleDatabase;
  dashboardService?: DashboardService;
}

/**
 * Dashboard REST Routes
 * Provides APIs for retrieving dashboard statistics
 * Implements caching via DashboardService (5s TTL)
 */
export async function dashboardHandler(
  app: FastifyInstance,
  options: DashboardHandlerOptions
): Promise<void> {
  const { db } = options;

  // Initialize dashboard service (or use injected one for testing)
  const dashboardService = options.dashboardService ?? new DashboardService(db);

  /**
   * Error handler helper
   * Centralizes error handling logic for consistent responses
   *
   * @param error - Error object to handle
   * @param reply - Fastify reply object for sending response
   */
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
   * GET /stats - Get dashboard statistics
   * Returns aggregated statistics for repositories, agents, and work items
   * Uses 5-second cache to minimize database load
   *
   * Response:
   * - 200: Dashboard data with all statistics
   * - 500: Internal server error
   */
  app.get("/stats", async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Fetch dashboard data (will use cache if available)
      const dashboardData = await dashboardService.getDashboardData();

      // Send successful response
      reply.send(dashboardData);
    } catch (error) {
      handleError(error, reply);
    }
  });
}
