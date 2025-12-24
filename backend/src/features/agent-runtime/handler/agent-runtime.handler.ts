import type { FastifyInstance, FastifyPluginOptions, FastifyReply } from "fastify";
import { z, ZodError } from "zod";
import type { DrizzleDatabase } from "../../../db/index.js";
import type { Config } from "../../../config.js";
import { AgentExecutionRepository } from "../repositories/agent-execution.repository.js";
import { WorkspaceRepository } from "../../../repositories/workspace.repository.js";
import { WorkerRepository } from "../../../repositories/worker.repository.js";
import { WorkItemRepository } from "../../../repositories/work-item.repository.js";
import { v4 as uuidv4 } from "uuid";

export interface AgentRuntimeRoutesOptions extends FastifyPluginOptions {
  db: DrizzleDatabase;
  config: Config;
}

// Request validation schemas
const executeSchema = z.object({
  workerId: z.string().min(1),
  workItemId: z.string().min(1),
  prompt: z.string().min(1),
});

/**
 * Agent Runtime REST Routes
 * Provides APIs for agent execution management, status tracking, and workspace operations
 */
export async function agentRuntimeRoutes(
  app: FastifyInstance,
  options: AgentRuntimeRoutesOptions
): Promise<void> {
  const { db } = options;

  // Initialize repositories
  const executionRepo = new AgentExecutionRepository(db);
  const workspaceRepo = new WorkspaceRepository(db);
  const workerRepo = new WorkerRepository(db);
  const workItemRepo = new WorkItemRepository(db);

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

    if (error instanceof Error) {
      const message = error.message;

      if (message.includes("not found")) {
        reply.status(404).send({
          error: message,
          statusCode: 404,
        });
        return;
      }

      if (message.includes("not running") || message.includes("cannot cancel")) {
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

  /**
   * POST /execute - Start agent execution
   * Body: { workerId: string, workItemId: string, prompt: string }
   * Returns: { executionId: string }
   */
  app.post("/execute", async (request, reply) => {
    try {
      const { workerId, workItemId, prompt: _prompt } = executeSchema.parse(request.body);

      // Validate workerId exists
      const worker = await workerRepo.findById(workerId);
      if (!worker) {
        reply.status(404).send({
          error: `Worker with id ${workerId} not found`,
          statusCode: 404,
        });
        return;
      }

      // Validate workItemId exists
      const workItem = await workItemRepo.findById(workItemId);
      if (!workItem) {
        reply.status(404).send({
          error: `Work item with id ${workItemId} not found`,
          statusCode: 404,
        });
        return;
      }

      // Create execution record
      const executionId = uuidv4();
      const now = new Date();

      const execution = await executionRepo.create({
        id: executionId,
        workerId,
        workItemId,
        templateId: worker.templateId,
        status: "pending",
        createdAt: now,
      });

      // Return execution ID
      reply.status(201).send({
        executionId: execution.id,
      });
    } catch (error) {
      handleError(error, reply);
    }
  });

  /**
   * GET /executions/:id - Get execution details
   * Returns execution record or 404
   */
  app.get("/executions/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const execution = await executionRepo.findById(id);
      if (!execution) {
        reply.status(404).send({
          error: `Execution with id ${id} not found`,
          statusCode: 404,
        });
        return;
      }

      return execution;
    } catch (error) {
      handleError(error, reply);
    }
  });

  /**
   * POST /executions/:id/cancel - Cancel running execution
   * Returns 200 on success, 404 if not found, 409 if not running
   */
  app.post("/executions/:id/cancel", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const execution = await executionRepo.findById(id);
      if (!execution) {
        reply.status(404).send({
          error: `Execution with id ${id} not found`,
          statusCode: 404,
        });
        return;
      }

      // Check if execution is in a cancellable state
      if (execution.status !== "running" && execution.status !== "pending") {
        reply.status(409).send({
          error: `Execution with id ${id} is not running (current status: ${execution.status})`,
          statusCode: 409,
        });
        return;
      }

      // Update execution status to cancelled
      const updated = await executionRepo.updateStatus(id, "cancelled");

      return updated;
    } catch (error) {
      handleError(error, reply);
    }
  });

  /**
   * GET /workspaces - List active workspaces
   * Returns array of workspace records
   */
  app.get("/workspaces", async (request, reply) => {
    try {
      // Get all active workspaces (status = 'active')
      const workspaces = await workspaceRepo.findByStatus("active");
      return workspaces;
    } catch (error) {
      handleError(error, reply);
    }
  });

  /**
   * DELETE /workspaces/:id - Cleanup workspace
   * Returns 200 on success, 404 if not found
   */
  app.delete("/workspaces/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      // Check if workspace exists
      const workspace = await workspaceRepo.findById(id);
      if (!workspace) {
        reply.status(404).send({
          error: `Workspace with id ${id} not found`,
          statusCode: 404,
        });
        return;
      }

      // Delete the workspace
      await workspaceRepo.delete(id);

      reply.status(200).send({
        message: `Workspace ${id} deleted successfully`,
      });
    } catch (error) {
      handleError(error, reply);
    }
  });
}
