import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import type { DrizzleDatabase } from "../db/index.js";
import {
  workers,
  templates,
  workerStatuses,
  agentRoles,
  type Worker,
  type WorkerStatus,
} from "../db/schema.js";
import { broadcaster } from "../lib/broadcaster.js";

// Validation schemas
const spawnWorkerSchema = z.object({
  templateId: z.string().min(1, "Template ID is required"),
  currentWorkItemId: z.string().optional(),
  currentRole: z.enum(agentRoles).optional(),
});

const updateWorkerStatusSchema = z.object({
  status: z.enum(workerStatuses),
});

const listQuerySchema = z.object({
  status: z.enum(workerStatuses).optional(),
  templateId: z.string().optional(),
});

// Valid status transitions for workers
const validWorkerStatusTransitions: Record<WorkerStatus, WorkerStatus[]> = {
  idle: ["working", "paused", "terminated"],
  working: ["idle", "paused", "error", "terminated"],
  paused: ["working", "idle", "terminated"],
  error: ["idle", "paused", "terminated"],
  terminated: [], // Cannot transition from terminated
};

function isValidWorkerStatusTransition(
  from: WorkerStatus,
  to: WorkerStatus
): boolean {
  return validWorkerStatusTransitions[from]?.includes(to) ?? false;
}

export async function workerRoutes(
  app: FastifyInstance,
  { db }: { db: DrizzleDatabase }
) {
  // GET /api/workers - List all workers with optional status filter
  app.get("/", async (request, reply) => {
    try {
      const queryResult = listQuerySchema.safeParse(request.query);

      if (!queryResult.success) {
        return reply.status(400).send({
          error: "Invalid query parameters",
          details: queryResult.error.issues,
        });
      }

      const { status, templateId } = queryResult.data;

      let query = db.select().from(workers);

      // Build filter conditions
      const conditions = [];
      if (status) {
        conditions.push(eq(workers.status, status));
      }
      if (templateId) {
        conditions.push(eq(workers.templateId, templateId));
      }

      // Apply filters
      const allWorkers =
        conditions.length > 0
          ? await query.where(and(...conditions))
          : await query;

      return reply.send({
        data: allWorkers,
        count: allWorkers.length,
      });
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: "Failed to fetch workers",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // GET /api/workers/:id - Get single worker with metrics
  app.get("/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const [worker] = await db
        .select()
        .from(workers)
        .where(eq(workers.id, id));

      if (!worker) {
        return reply.status(404).send({
          error: "Worker not found",
        });
      }

      // Get the template associated with this worker
      const [template] = await db
        .select()
        .from(templates)
        .where(eq(templates.id, worker.templateId));

      // Calculate metrics
      const metrics = {
        contextUsagePercent:
          (worker.contextWindowUsed / worker.contextWindowLimit) * 100,
        tokensUsed: worker.tokensUsed,
        costUsd: worker.costUsd,
        toolCalls: worker.toolCalls,
        errors: worker.errors,
        uptime: Date.now() - worker.spawnedAt.getTime(),
      };

      return reply.send({
        data: {
          ...worker,
          template,
          metrics,
        },
      });
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: "Failed to fetch worker",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // POST /api/workers - Spawn new worker from template
  app.post("/", async (request, reply) => {
    try {
      const validationResult = spawnWorkerSchema.safeParse(request.body);

      if (!validationResult.success) {
        return reply.status(400).send({
          error: "Invalid request body",
          details: validationResult.error.issues,
        });
      }

      const data = validationResult.data;

      // Verify template exists
      const [template] = await db
        .select()
        .from(templates)
        .where(eq(templates.id, data.templateId));

      if (!template) {
        return reply.status(404).send({
          error: "Template not found",
        });
      }

      const now = new Date();

      const newWorker = {
        id: uuidv4(),
        templateId: data.templateId,
        status: "idle" as WorkerStatus,
        currentWorkItemId: data.currentWorkItemId ?? null,
        currentRole: data.currentRole ?? template.defaultRole ?? null,
        sessionId: uuidv4(), // Generate a new session ID for the Claude Agent SDK
        spawnedAt: now,
        contextWindowUsed: 0,
        contextWindowLimit: 200000,
        tokensUsed: 0,
        costUsd: 0,
        toolCalls: 0,
        errors: 0,
      };

      await db.insert(workers).values(newWorker);

      // Broadcast the new worker to all connected clients
      broadcaster.broadcastWorkerUpdate(newWorker);

      return reply.status(201).send({
        data: {
          ...newWorker,
          template,
        },
      });
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: "Failed to spawn worker",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // PATCH /api/workers/:id/status - Update worker status
  app.patch("/:id/status", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const validationResult = updateWorkerStatusSchema.safeParse(
        request.body
      );

      if (!validationResult.success) {
        return reply.status(400).send({
          error: "Invalid request body",
          details: validationResult.error.issues,
        });
      }

      const { status: newStatus } = validationResult.data;

      // Check if worker exists
      const [existingWorker] = await db
        .select()
        .from(workers)
        .where(eq(workers.id, id));

      if (!existingWorker) {
        return reply.status(404).send({
          error: "Worker not found",
        });
      }

      // Validate status transition
      if (newStatus !== existingWorker.status) {
        if (
          !isValidWorkerStatusTransition(existingWorker.status, newStatus)
        ) {
          return reply.status(400).send({
            error: "Invalid status transition",
            message: `Cannot transition from ${existingWorker.status} to ${newStatus}`,
            allowedTransitions:
              validWorkerStatusTransitions[existingWorker.status],
          });
        }
      }

      await db
        .update(workers)
        .set({ status: newStatus })
        .where(eq(workers.id, id));

      const [updatedWorker] = await db
        .select()
        .from(workers)
        .where(eq(workers.id, id));

      // Broadcast the update to all connected clients
      if (updatedWorker) {
        broadcaster.broadcastWorkerUpdate(updatedWorker);
      }

      return reply.send({ data: updatedWorker });
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: "Failed to update worker status",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // DELETE /api/workers/:id - Terminate worker
  app.delete("/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      // Check if worker exists
      const [existingWorker] = await db
        .select()
        .from(workers)
        .where(eq(workers.id, id));

      if (!existingWorker) {
        return reply.status(404).send({
          error: "Worker not found",
        });
      }

      // Set status to terminated before deletion (for audit trail)
      await db
        .update(workers)
        .set({ status: "terminated" as WorkerStatus })
        .where(eq(workers.id, id));

      // Get the terminated worker to broadcast
      const [terminatedWorker] = await db
        .select()
        .from(workers)
        .where(eq(workers.id, id));

      if (terminatedWorker) {
        broadcaster.broadcastWorkerUpdate(terminatedWorker);
      }

      // Optionally, we could keep the worker record and just mark it as terminated
      // instead of deleting it. For now, we'll delete it.
      await db.delete(workers).where(eq(workers.id, id));

      return reply.status(204).send();
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: "Failed to terminate worker",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}
