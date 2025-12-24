import type { FastifyInstance, FastifyPluginOptions, FastifyReply } from "fastify";
import { z, ZodError } from "zod";
import {
  ConcurrencyLimitsService,
  type ConcurrencyStatus,
} from "../features/orchestration/services/orchestration.service.js";

export interface ConcurrencyRoutesOptions extends FastifyPluginOptions {
  concurrencyService: ConcurrencyLimitsService;
}

// Request validation schemas
const updateLimitsSchema = z.object({
  maxGlobalWorkers: z.number().int().min(1).max(1000).optional(),
  maxWorkersPerRepo: z.number().int().min(1).max(100).optional(),
  maxWorkersPerUser: z.number().int().min(1).max(100).optional(),
});

/**
 * Concurrency Limits REST Routes (em3.5)
 * Provides APIs for managing and monitoring concurrent agent execution limits
 */
export async function concurrencyRoutes(
  app: FastifyInstance,
  options: ConcurrencyRoutesOptions
): Promise<void> {
  const { concurrencyService } = options;

  // Error handler helper
  const handleError = (error: unknown, reply: FastifyReply): void => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: "Validation failed",
        details: error.issues.map((e: z.ZodIssue) => ({
          path: e.path,
          message: e.message,
        })),
        statusCode: 400,
      });
      return;
    }

    // Unknown error - rethrow
    throw error;
  };

  /**
   * GET /status - Get current concurrency status
   * Returns global, per-repo, and per-user execution counts and limits
   */
  app.get("/status", async (_request, _reply): Promise<ConcurrencyStatus> => {
    return concurrencyService.getStatus();
  });

  /**
   * GET /limits - Get current limit configuration
   * Returns the configured limits for global, per-repo, and per-user
   */
  app.get("/limits", async (_request, _reply) => {
    const status = concurrencyService.getStatus();
    return {
      maxGlobalWorkers: status.global.max,
      maxWorkersPerRepo: Object.values(status.byRepo)[0]?.max ?? status.global.max,
      maxWorkersPerUser: Object.values(status.byUser)[0]?.max ?? status.global.max,
    };
  });

  /**
   * PUT /limits - Update concurrency limits
   * Body: { maxGlobalWorkers?: number, maxWorkersPerRepo?: number, maxWorkersPerUser?: number }
   * Returns: Updated limits configuration
   */
  app.put("/limits", async (request, reply) => {
    try {
      const updates = updateLimitsSchema.parse(request.body);

      // Check if at least one limit is provided
      if (
        updates.maxGlobalWorkers === undefined &&
        updates.maxWorkersPerRepo === undefined &&
        updates.maxWorkersPerUser === undefined
      ) {
        reply.status(400).send({
          error: "At least one limit must be provided",
          statusCode: 400,
        });
        return;
      }

      // Update the configuration - filter out undefined values
      const configUpdate: {
        maxGlobalWorkers?: number;
        maxWorkersPerRepo?: number;
        maxWorkersPerUser?: number;
      } = {};
      if (updates.maxGlobalWorkers !== undefined) {
        configUpdate.maxGlobalWorkers = updates.maxGlobalWorkers;
      }
      if (updates.maxWorkersPerRepo !== undefined) {
        configUpdate.maxWorkersPerRepo = updates.maxWorkersPerRepo;
      }
      if (updates.maxWorkersPerUser !== undefined) {
        configUpdate.maxWorkersPerUser = updates.maxWorkersPerUser;
      }
      concurrencyService.updateConfig(configUpdate);

      // Return updated limits
      const status = concurrencyService.getStatus();
      return {
        maxGlobalWorkers: status.global.max,
        maxWorkersPerRepo: updates.maxWorkersPerRepo ?? status.global.max,
        maxWorkersPerUser: updates.maxWorkersPerUser ?? status.global.max,
      };
    } catch (error) {
      handleError(error, reply);
    }
  });

  /**
   * GET /can-start - Check if a new execution can start
   * Query: repositoryId (optional), userId (required)
   * Returns: { allowed: boolean, reason?: string }
   */
  app.get("/can-start", async (request, reply) => {
    const { repositoryId, userId } = request.query as {
      repositoryId?: string;
      userId?: string;
    };

    if (!userId) {
      reply.status(400).send({
        error: "userId query parameter is required",
        statusCode: 400,
      });
      return;
    }

    // Create a minimal work item for checking
    const mockWorkItem = {
      createdBy: userId,
      repositoryId: repositoryId || undefined,
    } as { createdBy: string; repositoryId?: string };

    const result = concurrencyService.canStartExecution(mockWorkItem as any);
    return result;
  });
}
