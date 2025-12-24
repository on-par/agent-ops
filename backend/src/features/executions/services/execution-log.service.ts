import { eq, and, gte, lte, desc, asc } from "drizzle-orm";
import type { DrizzleDatabase } from "../../../shared/db/index.js";
import {
  agentExecutions,
  traces,
  type AgentExecution,
} from "../../../shared/db/schema.js";
import type {
  ExecutionListItem,
  ExecutionDetail,
  ExecutionFilters,
  ExecutionListResponse,
  TraceEvent,
  TraceFilters,
} from "../types/execution-log.types.js";

/**
 * Service for execution log viewing and trace retrieval
 * Provides methods to query executions with associated traces
 */
export class ExecutionLogService {
  constructor(private db: DrizzleDatabase) {}

  /**
   * Get paginated list of executions with filtering
   * @param filters - Query filters (status, workerId, etc.)
   * @returns Paginated execution list response
   */
  async getExecutionList(
    filters: ExecutionFilters = {}
  ): Promise<ExecutionListResponse> {
    const {
      status,
      workerId,
      workItemId,
      dateFrom,
      dateTo,
      limit = 20,
      offset = 0,
    } = filters;

    // Build query conditions
    const conditions = [];

    if (status) {
      conditions.push(eq(agentExecutions.status, status));
    }

    if (workerId) {
      conditions.push(eq(agentExecutions.workerId, workerId));
    }

    if (workItemId) {
      conditions.push(eq(agentExecutions.workItemId, workItemId));
    }

    if (dateFrom) {
      conditions.push(gte(agentExecutions.createdAt, dateFrom));
    }

    if (dateTo) {
      conditions.push(lte(agentExecutions.createdAt, dateTo));
    }

    // Build query
    let query = this.db
      .select()
      .from(agentExecutions)
      .orderBy(desc(agentExecutions.createdAt))
      .limit(limit + 1) // Fetch one extra to determine hasMore
      .offset(offset);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const results = await query;

    // Determine if there are more results
    const hasMore = results.length > limit;
    const items = results.slice(0, limit);

    // Get total count for filtered query
    let countQuery = this.db
      .select({ count: agentExecutions.id })
      .from(agentExecutions);

    if (conditions.length > 0) {
      countQuery = countQuery.where(and(...conditions)) as typeof countQuery;
    }

    const countResult = await countQuery;
    const total = countResult.length;

    // Map to ExecutionListItem
    const executionItems: ExecutionListItem[] = items.map((exec) => ({
      id: exec.id,
      status: exec.status,
      workerId: exec.workerId,
      workItemId: exec.workItemId,
      startedAt: exec.startedAt,
      completedAt: exec.completedAt,
      durationMs: exec.durationMs,
      tokensUsed: exec.tokensUsed,
      errorMessage: exec.errorMessage,
      createdAt: exec.createdAt,
    }));

    return {
      items: executionItems,
      total,
      hasMore,
    };
  }

  /**
   * Get execution by ID with associated traces
   * @param id - Execution ID
   * @returns Execution detail with traces, or null if not found
   */
  async getExecutionById(id: string): Promise<ExecutionDetail | null> {
    // Get execution
    const [execution] = await this.db
      .select()
      .from(agentExecutions)
      .where(eq(agentExecutions.id, id))
      .limit(1);

    if (!execution) {
      return null;
    }

    // Get traces associated with this execution
    // Traces are linked via workerId and workItemId
    const conditions = [];
    if (execution.workerId) {
      conditions.push(eq(traces.workerId, execution.workerId));
    }
    if (execution.workItemId) {
      conditions.push(eq(traces.workItemId, execution.workItemId));
    }

    let traceQuery = this.db
      .select()
      .from(traces)
      .orderBy(asc(traces.timestamp));

    if (conditions.length > 0) {
      traceQuery = traceQuery.where(and(...conditions)) as typeof traceQuery;
    }

    const traceResults = await traceQuery;

    // Map traces to TraceEvent
    const traceEvents: TraceEvent[] = traceResults.map((trace) => ({
      id: trace.id,
      eventType: trace.eventType,
      data: trace.data,
      timestamp: trace.timestamp,
    }));

    // Build ExecutionDetail
    const detail: ExecutionDetail = {
      id: execution.id,
      status: execution.status,
      workerId: execution.workerId,
      workItemId: execution.workItemId,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      durationMs: execution.durationMs,
      tokensUsed: execution.tokensUsed,
      errorMessage: execution.errorMessage,
      output: execution.output,
      traces: traceEvents,
      createdAt: execution.createdAt,
    };

    return detail;
  }

  /**
   * Get traces for an execution with optional filtering
   * @param executionId - Execution ID
   * @param filters - Trace filters (eventType, etc.)
   * @returns Array of trace events
   */
  async getTracesByExecutionId(
    executionId: string,
    filters: TraceFilters = {}
  ): Promise<TraceEvent[]> {
    // First get the execution to find workerId and workItemId
    const [execution] = await this.db
      .select()
      .from(agentExecutions)
      .where(eq(agentExecutions.id, executionId))
      .limit(1);

    if (!execution) {
      return [];
    }

    // Build trace query conditions
    const conditions = [];
    if (execution.workerId) {
      conditions.push(eq(traces.workerId, execution.workerId));
    }
    if (execution.workItemId) {
      conditions.push(eq(traces.workItemId, execution.workItemId));
    }

    // Add eventType filter if provided
    if (filters.eventType) {
      conditions.push(eq(traces.eventType, filters.eventType));
    }

    let query = this.db
      .select()
      .from(traces)
      .orderBy(asc(traces.timestamp));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const results = await query;

    // Map to TraceEvent
    return results.map((trace) => ({
      id: trace.id,
      eventType: trace.eventType,
      data: trace.data,
      timestamp: trace.timestamp,
    }));
  }
}
