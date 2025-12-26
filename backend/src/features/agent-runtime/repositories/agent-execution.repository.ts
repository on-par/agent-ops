import { eq } from "drizzle-orm";
import type { DrizzleDatabase } from "../../../shared/db/index.js";
import {
  agentExecutions,
  type AgentExecution,
  type NewAgentExecution,
  type AgentExecutionStatus,
  type AgentExecutionOutput,
} from "../../../shared/db/schema.js";

/**
 * Repository for managing Agent Execution entities using Drizzle ORM
 * Tracks execution history and metrics for agent runs
 */
export class AgentExecutionRepository {
  constructor(private db: DrizzleDatabase) {}

  /**
   * Create a new agent execution record
   * @param execution - Execution data to insert
   * @returns The created execution record
   */
  async create(execution: NewAgentExecution): Promise<AgentExecution> {
    const [createdExecution] = await this.db
      .insert(agentExecutions)
      .values(execution)
      .returning();

    if (!createdExecution) {
      throw new Error("Failed to create agent execution");
    }

    return createdExecution;
  }

  /**
   * Find an execution by ID
   * @param id - Execution ID
   * @returns Execution if found, null otherwise
   */
  async findById(id: string): Promise<AgentExecution | null> {
    const [execution] = await this.db
      .select()
      .from(agentExecutions)
      .where(eq(agentExecutions.id, id))
      .limit(1);

    return execution || null;
  }

  /**
   * Find all executions for a worker
   * @param workerId - Worker ID to filter by
   * @returns Array of executions for the worker
   */
  async findByWorkerId(workerId: string): Promise<AgentExecution[]> {
    return await this.db
      .select()
      .from(agentExecutions)
      .where(eq(agentExecutions.workerId, workerId));
  }

  /**
   * Find all executions for a work item
   * @param workItemId - Work item ID to filter by
   * @returns Array of executions for the work item
   */
  async findByWorkItemId(workItemId: string): Promise<AgentExecution[]> {
    return await this.db
      .select()
      .from(agentExecutions)
      .where(eq(agentExecutions.workItemId, workItemId));
  }

  /**
   * Update an execution record
   * @param id - Execution ID
   * @param data - Partial execution data to update
   * @returns The updated execution
   * @throws Error if execution not found
   */
  async update(
    id: string,
    data: Partial<AgentExecution>
  ): Promise<AgentExecution> {
    const [updatedExecution] = await this.db
      .update(agentExecutions)
      .set(data)
      .where(eq(agentExecutions.id, id))
      .returning();

    if (!updatedExecution) {
      throw new Error(`Agent execution with id ${id} not found`);
    }

    return updatedExecution;
  }

  /**
   * Update execution status with appropriate timestamps
   * @param id - Execution ID
   * @param status - New status
   * @returns The updated execution
   */
  async updateStatus(
    id: string,
    status: AgentExecutionStatus
  ): Promise<AgentExecution> {
    const now = new Date();
    const updates: Partial<AgentExecution> = { status };

    // Set timestamps based on status
    if (status === "running") {
      updates.startedAt = now;
    } else if (["success", "error", "cancelled"].includes(status)) {
      // Ensure startedAt is set if not already
      const existing = await this.findById(id);
      if (existing && !existing.startedAt) {
        updates.startedAt = now;
      }
      updates.completedAt = now;

      // Calculate duration if we have startedAt
      if (existing?.startedAt) {
        updates.durationMs = now.getTime() - existing.startedAt.getTime();
      }
    }

    return await this.update(id, updates);
  }

  /**
   * Set the output JSON for an execution
   * @param id - Execution ID
   * @param output - Output data to store
   * @returns The updated execution
   */
  async setOutput(
    id: string,
    output: AgentExecutionOutput
  ): Promise<AgentExecution> {
    return await this.update(id, { output });
  }

  /**
   * Update execution metrics
   * @param id - Execution ID
   * @param metrics - Metrics to update
   * @returns The updated execution
   */
  async updateMetrics(
    id: string,
    metrics: {
      tokensUsed?: number;
      costUsd?: number;
      toolCallsCount?: number;
    }
  ): Promise<AgentExecution> {
    const updates: Partial<AgentExecution> = {};

    if (metrics.tokensUsed !== undefined) {
      updates.tokensUsed = metrics.tokensUsed;
    }
    if (metrics.costUsd !== undefined) {
      updates.costUsd = metrics.costUsd;
    }
    if (metrics.toolCallsCount !== undefined) {
      updates.toolCallsCount = metrics.toolCallsCount;
    }

    return await this.update(id, updates);
  }

  /**
   * Find executions by multiple statuses
   * @param statuses - Array of statuses to filter by
   * @returns Array of executions matching any of the statuses
   */
  async findByStatuses(statuses: AgentExecutionStatus[]): Promise<AgentExecution[]> {
    const { inArray } = await import("drizzle-orm");
    return await this.db
      .select()
      .from(agentExecutions)
      .where(inArray(agentExecutions.status, statuses));
  }

  /**
   * Find most recent executions
   * @param limit - Maximum number of executions to return (default: 10)
   * @returns Array of recent executions ordered by createdAt descending
   */
  async findRecent(limit: number = 10): Promise<AgentExecution[]> {
    const { desc } = await import("drizzle-orm");
    return await this.db
      .select()
      .from(agentExecutions)
      .orderBy(desc(agentExecutions.createdAt))
      .limit(limit);
  }
}
