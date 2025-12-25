import type { FastifyInstance, FastifyPluginOptions, FastifyReply } from "fastify";
import { ZodError } from "zod";
import type { WorkerPoolService } from "../services/worker-pool.service.js";
import {
  SpawnWorkerSchema,
  AssignWorkSchema,
  UpdateMetricsSchema,
  ReportErrorSchema,
  TemplateIdQuerySchema,
} from "../schemas/worker.schemas.js";

export interface WorkersHandlerOptions extends FastifyPluginOptions {
  workerPoolService: WorkerPoolService;
}

/**
 * Workers REST Handler
 * Provides CRUD and lifecycle operations for worker pool management
 */
export async function workersHandler(
  app: FastifyInstance,
  options: WorkersHandlerOptions
): Promise<void> {
  const { workerPoolService } = options;

  // Error handler helper
  const handleError = (
    error: unknown,
    reply: FastifyReply
  ): void => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: "Validation failed",
        details: error.issues.map((e) => ({
          path: e.path,
          message: e.message,
        })),
        statusCode: 400,
      });
      return;
    }

    if (error instanceof Error) {
      const message = error.message;

      // Handle not found errors
      if (message.includes("not found")) {
        reply.status(404).send({
          error: message,
          statusCode: 404,
        });
        return;
      }

      // Handle state constraint errors (paused/working/idle)
      if (
        message.includes("not in working status") ||
        message.includes("not in paused status") ||
        message.includes("not idle")
      ) {
        reply.status(409).send({
          error: message,
          statusCode: 409,
        });
        return;
      }

      // Handle maximum limit errors
      if (message.includes("maximum")) {
        reply.status(409).send({
          error: message,
          statusCode: 409,
        });
        return;
      }
    }

    // Unknown error - rethrow
    throw error;
  };

  // GET / - Get pool summary
  app.get("/", async (request, reply) => {
    try {
      const summary = await workerPoolService.getPool();
      return summary;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // POST /spawn - Spawn new worker
  app.post("/spawn", async (request, reply) => {
    try {
      const { templateId, sessionId } = SpawnWorkerSchema.parse(request.body);
      const worker = await workerPoolService.spawn(templateId, sessionId);
      reply.status(201);
      return worker;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // GET /available - Get idle workers
  app.get("/available", async (request, reply) => {
    try {
      const workers = await workerPoolService.getAvailableWorkers();
      return workers;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // GET /by-template - Get workers by template ID
  app.get("/by-template", async (request, reply) => {
    try {
      const query = TemplateIdQuerySchema.parse(request.query);
      if (!query.templateId) {
        reply.status(400).send({
          error: "Template ID is required",
          statusCode: 400,
        });
        return;
      }
      const workers = await workerPoolService.getWorkersByTemplate(query.templateId);
      return workers;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // POST /:id/terminate - Terminate worker
  app.post("/:id/terminate", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const worker = await workerPoolService.terminate(id);
      return worker;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // POST /:id/pause - Pause worker
  app.post("/:id/pause", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const worker = await workerPoolService.pause(id);
      return worker;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // POST /:id/resume - Resume worker
  app.post("/:id/resume", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const worker = await workerPoolService.resume(id);
      return worker;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // POST /:id/assign - Assign work
  app.post("/:id/assign", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { workItemId, role } = AssignWorkSchema.parse(request.body);
      const worker = await workerPoolService.assignWork(id, workItemId, role);
      return worker;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // POST /:id/complete - Complete work
  app.post("/:id/complete", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const worker = await workerPoolService.completeWork(id);
      return worker;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // PATCH /:id/metrics - Update metrics
  app.patch("/:id/metrics", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const metrics = UpdateMetricsSchema.parse(request.body);
      const worker = await workerPoolService.updateMetrics(id, metrics as any);
      return worker;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // POST /:id/error - Report error
  app.post("/:id/error", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { error } = ReportErrorSchema.parse(request.body);
      const worker = await workerPoolService.reportError(id, error);
      return worker;
    } catch (error) {
      handleError(error, reply);
    }
  });
}
