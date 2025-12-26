import type { FastifyInstance, FastifyPluginOptions, FastifyReply } from "fastify";
import { z, ZodError } from "zod";
import type { DrizzleDatabase } from "../../../shared/db/index.js";
import type { Config } from "../../../shared/config.js";
import type { WorkerPoolService } from "../../workers/services/worker-pool.service.js";
import { AgentExecutionRepository } from "../repositories/agent-execution.repository.js";
import {
  StartAgentSchema,
  AgentIdParamsSchema,
  ListAgentsQuerySchema,
} from "../schemas/agents.schemas.js";
import { v4 as uuidv4 } from "uuid";

export interface AgentsHandlerOptions extends FastifyPluginOptions {
  db: DrizzleDatabase;
  config: Config;
  workerPoolService: WorkerPoolService;
}

/**
 * Agent lifecycle management REST API
 * Provides endpoints for starting, stopping, listing, and querying agent executions
 */
export async function agentsHandler(
  app: FastifyInstance,
  options: AgentsHandlerOptions
): Promise<void> {
  const { db, workerPoolService } = options;
  const executionRepo = new AgentExecutionRepository(db);

  // Error handler helper - follows existing pattern
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

      if (
        message.includes("maximum") ||
        message.includes("already") ||
        message.includes("Maximum")
      ) {
        reply.status(409).send({
          error: message,
          statusCode: 409,
        });
        return;
      }
    }

    throw error;
  };

  /**
   * POST /start - Start a new agent execution
   * Returns 202 Accepted with Location header pointing to agent details
   */
  app.post("/start", async (request, reply) => {
    try {
      const { taskId, pattern } = StartAgentSchema.parse(request.body);

      // Check if we can spawn more workers
      if (!(await workerPoolService.canSpawnMore())) {
        reply.status(409).send({
          error: "Maximum worker limit reached",
          statusCode: 409,
        });
        return;
      }

      // Create execution record
      const executionId = uuidv4();
      const execution = await executionRepo.create({
        id: executionId,
        workItemId: taskId,
        status: "pending",
        createdAt: new Date(),
      });

      reply
        .status(202)
        .header("Location", `/api/agents/${executionId}`)
        .send({
          id: executionId,
          status: "pending",
          taskId,
          pattern,
          createdAt: execution.createdAt,
        });
    } catch (error) {
      handleError(error, reply);
    }
  });

  /**
   * DELETE /:id - Stop a running agent
   * Returns 204 No Content on success
   */
  app.delete("/:id", async (request, reply) => {
    try {
      const { id } = AgentIdParamsSchema.parse(request.params);

      const execution = await executionRepo.findById(id);
      if (!execution) {
        reply.status(404).send({
          error: `Agent with id ${id} not found`,
          statusCode: 404,
        });
        return;
      }

      if (!["pending", "running"].includes(execution.status)) {
        reply.status(409).send({
          error: `Agent with id ${id} is already stopped (status: ${execution.status})`,
          statusCode: 409,
        });
        return;
      }

      // Terminate worker if assigned
      if (execution.workerId) {
        try {
          await workerPoolService.terminate(execution.workerId);
        } catch {
          // Worker may already be terminated, continue with status update
        }
      }

      await executionRepo.updateStatus(id, "cancelled");
      reply.status(204).send();
    } catch (error) {
      handleError(error, reply);
    }
  });

  /**
   * GET / - List running agents
   * Returns array of pending/running agent executions
   */
  app.get("/", async (request, reply) => {
    try {
      const executions = await executionRepo.findByStatuses(["pending", "running"]);
      reply.send({
        agents: executions.map((exec) => ({
          id: exec.id,
          taskId: exec.workItemId,
          status: exec.status,
          workerId: exec.workerId,
          startedAt: exec.startedAt,
          createdAt: exec.createdAt,
        })),
      });
    } catch (error) {
      handleError(error, reply);
    }
  });

  /**
   * GET /:id - Get agent details
   * Returns full execution details with metrics
   * Includes Retry-After header when agent is running
   */
  app.get("/:id", async (request, reply) => {
    try {
      const { id } = AgentIdParamsSchema.parse(request.params);

      const execution = await executionRepo.findById(id);
      if (!execution) {
        reply.status(404).send({
          error: `Agent with id ${id} not found`,
          statusCode: 404,
        });
        return;
      }

      // Add Retry-After header for polling clients
      if (execution.status === "running") {
        reply.header("Retry-After", "5");
      }

      reply.send({
        id: execution.id,
        taskId: execution.workItemId,
        status: execution.status,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        workerId: execution.workerId,
        metrics: {
          tokensUsed: execution.tokensUsed,
          costUsd: execution.costUsd,
          toolCallsCount: execution.toolCallsCount,
          durationMs: execution.durationMs,
        },
        error: execution.errorMessage,
        output: execution.output,
      });
    } catch (error) {
      handleError(error, reply);
    }
  });
}
