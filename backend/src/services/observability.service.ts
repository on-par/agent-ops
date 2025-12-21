import { eq, and, gte, lte, desc, sql, count } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { DrizzleDatabase } from "../db/index.js";
import { traces, workers, type NewTrace, type TraceEventType, type Trace } from "../db/schema.js";

/**
 * Query options for filtering traces
 */
export interface TraceQueryOptions {
  startTime?: Date;
  endTime?: Date;
  workerId?: string;
  workItemId?: string;
  eventType?: TraceEventType;
  limit?: number;
  offset?: number;
}

/**
 * Query options for cost summaries
 */
export interface CostQueryOptions {
  startTime?: Date;
  endTime?: Date;
  groupBy?: "hour" | "day" | "week";
}

/**
 * System-wide aggregated metrics
 */
export interface SystemMetrics {
  totalWorkers: number;
  activeWorkers: number;
  totalTokensUsed: number;
  totalCostUsd: number;
  totalToolCalls: number;
  totalErrors: number;
  tracesLast24h: number;
}

/**
 * Worker-specific aggregated metrics
 */
export interface WorkerMetrics {
  workerId: string;
  tokensUsed: number;
  costUsd: number;
  toolCalls: number;
  errors: number;
  totalTraces: number;
  lastActivity?: Date;
}

/**
 * Tool call statistics
 */
export interface ToolCallStats {
  totalCalls: number;
  byTool: Record<string, number>;
  averageCallsPerWorker: number;
  workersWithToolCalls: number;
}

/**
 * Cost summary entry
 */
export interface CostSummaryEntry {
  period: string;
  totalCost: number;
  tokenCount: number;
  toolCalls: number;
}

/**
 * Agent state data for trace events
 */
export interface AgentStateData {
  status: string;
  currentRole?: string;
  contextWindowUsed?: number;
  [key: string]: unknown;
}

/**
 * Work item update data for trace events
 */
export interface WorkItemUpdateData {
  status?: string;
  assignedAgent?: string;
  [key: string]: unknown;
}

/**
 * Tool call data for trace events
 */
export interface ToolCallData {
  toolName: string;
  input?: unknown;
  output?: unknown;
  duration?: number;
  success: boolean;
  errorMessage?: string;
  [key: string]: unknown;
}

/**
 * Error data for trace events
 */
export interface ErrorData {
  errorType: string;
  errorMessage: string;
  stackTrace?: string;
  context?: unknown;
  [key: string]: unknown;
}

/**
 * Approval required data for trace events
 */
export interface ApprovalRequiredData {
  action: string;
  reason: string;
  metadata?: unknown;
  [key: string]: unknown;
}

/**
 * ObservabilityService
 * Provides comprehensive tracing and metrics capabilities for agent operations
 */
export class ObservabilityService {
  constructor(private db: DrizzleDatabase) {}

  // ==================== TRACE RECORDING ====================

  /**
   * Record a single trace event
   * @param trace - Trace data to record
   * @returns The created trace
   */
  async recordTrace(trace: Omit<NewTrace, "id" | "timestamp">): Promise<Trace> {
    const newTrace: NewTrace = {
      id: randomUUID(),
      workerId: trace.workerId,
      workItemId: trace.workItemId,
      eventType: trace.eventType,
      data: trace.data,
      timestamp: new Date(),
    };

    const [created] = await this.db.insert(traces).values(newTrace).returning();

    if (!created) {
      throw new Error("Failed to create trace");
    }

    return created;
  }

  /**
   * Record an agent state change event
   * @param workerId - Worker ID
   * @param state - Agent state data
   * @returns The created trace
   */
  async recordAgentState(workerId: string, state: AgentStateData): Promise<Trace> {
    return await this.recordTrace({
      workerId,
      workItemId: null,
      eventType: "agent_state",
      data: state,
    });
  }

  /**
   * Record a work item update event
   * @param workItemId - Work item ID
   * @param data - Work item update data
   * @returns The created trace
   */
  async recordWorkItemUpdate(workItemId: string, data: WorkItemUpdateData): Promise<Trace> {
    return await this.recordTrace({
      workerId: null,
      workItemId,
      eventType: "work_item_update",
      data,
    });
  }

  /**
   * Record a tool call event
   * @param workerId - Worker ID
   * @param workItemId - Work item ID (optional)
   * @param data - Tool call data
   * @returns The created trace
   */
  async recordToolCall(
    workerId: string,
    workItemId: string | null,
    data: ToolCallData
  ): Promise<Trace> {
    return await this.recordTrace({
      workerId,
      workItemId,
      eventType: "tool_call",
      data,
    });
  }

  /**
   * Record an error event
   * @param workerId - Worker ID
   * @param workItemId - Work item ID (optional)
   * @param data - Error data
   * @returns The created trace
   */
  async recordError(
    workerId: string,
    workItemId: string | null,
    data: ErrorData
  ): Promise<Trace> {
    return await this.recordTrace({
      workerId,
      workItemId,
      eventType: "error",
      data,
    });
  }

  /**
   * Record an approval required event
   * @param workerId - Worker ID
   * @param workItemId - Work item ID
   * @param data - Approval required data
   * @returns The created trace
   */
  async recordApprovalRequired(
    workerId: string,
    workItemId: string,
    data: ApprovalRequiredData
  ): Promise<Trace> {
    return await this.recordTrace({
      workerId,
      workItemId,
      eventType: "approval_required",
      data,
    });
  }

  /**
   * Record a metric update event
   * @param workerId - Worker ID
   * @param data - Metric data
   * @returns The created trace
   */
  async recordMetricUpdate(workerId: string, data: unknown): Promise<Trace> {
    return await this.recordTrace({
      workerId,
      workItemId: null,
      eventType: "metric_update",
      data,
    });
  }

  // ==================== TRACE QUERIES ====================

  /**
   * Query traces with flexible filtering options
   * @param options - Query filter options
   * @returns Array of matching traces
   */
  async getTraces(options: TraceQueryOptions = {}): Promise<Trace[]> {
    const {
      startTime,
      endTime,
      workerId,
      workItemId,
      eventType,
      limit = 100,
      offset = 0,
    } = options;

    // Build query conditions
    const conditions = [];

    if (startTime) {
      conditions.push(gte(traces.timestamp, startTime));
    }

    if (endTime) {
      conditions.push(lte(traces.timestamp, endTime));
    }

    if (workerId) {
      conditions.push(eq(traces.workerId, workerId));
    }

    if (workItemId) {
      conditions.push(eq(traces.workItemId, workItemId));
    }

    if (eventType) {
      conditions.push(eq(traces.eventType, eventType));
    }

    // Build and execute query
    let query = this.db
      .select()
      .from(traces)
      .orderBy(desc(traces.timestamp))
      .limit(limit)
      .offset(offset);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    return await query;
  }

  /**
   * Get traces for a specific worker
   * @param workerId - Worker ID
   * @param limit - Maximum number of traces to return
   * @returns Array of traces for the worker
   */
  async getTracesForWorker(workerId: string, limit: number = 100): Promise<Trace[]> {
    return await this.getTraces({ workerId, limit });
  }

  /**
   * Get traces for a specific work item
   * @param workItemId - Work item ID
   * @param limit - Maximum number of traces to return
   * @returns Array of traces for the work item
   */
  async getTracesForWorkItem(workItemId: string, limit: number = 100): Promise<Trace[]> {
    return await this.getTraces({ workItemId, limit });
  }

  /**
   * Get recent error traces
   * @param limit - Maximum number of errors to return
   * @returns Array of recent error traces
   */
  async getRecentErrors(limit: number = 50): Promise<Trace[]> {
    return await this.getTraces({ eventType: "error", limit });
  }

  // ==================== METRICS AGGREGATION ====================

  /**
   * Get aggregated metrics for a specific worker
   * @param workerId - Worker ID
   * @returns Worker metrics
   */
  async getWorkerMetrics(workerId: string): Promise<WorkerMetrics> {
    // Get worker data
    const [worker] = await this.db
      .select()
      .from(workers)
      .where(eq(workers.id, workerId))
      .limit(1);

    if (!worker) {
      throw new Error(`Worker with ID ${workerId} not found`);
    }

    // Get trace count
    const [traceCountResult] = await this.db
      .select({ count: count() })
      .from(traces)
      .where(eq(traces.workerId, workerId));

    const totalTraces = traceCountResult?.count ?? 0;

    // Get last activity timestamp
    const [lastTrace] = await this.db
      .select({ timestamp: traces.timestamp })
      .from(traces)
      .where(eq(traces.workerId, workerId))
      .orderBy(desc(traces.timestamp))
      .limit(1);

    return {
      workerId,
      tokensUsed: worker.tokensUsed,
      costUsd: worker.costUsd,
      toolCalls: worker.toolCalls,
      errors: worker.errors,
      totalTraces,
      lastActivity: lastTrace?.timestamp ?? undefined,
    };
  }

  /**
   * Get system-wide aggregated metrics
   * @returns System metrics
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    // Get total and active worker counts
    const [workerStats] = await this.db
      .select({
        totalWorkers: count(),
        activeWorkers: sql<number>`SUM(CASE WHEN ${workers.status} IN ('idle', 'working') THEN 1 ELSE 0 END)`,
      })
      .from(workers);

    const totalWorkers = workerStats?.totalWorkers ?? 0;
    const activeWorkers = Number(workerStats?.activeWorkers ?? 0);

    // Aggregate metrics from all workers
    const [metricsStats] = await this.db
      .select({
        totalTokensUsed: sql<number>`COALESCE(SUM(${workers.tokensUsed}), 0)`,
        totalCostUsd: sql<number>`COALESCE(SUM(${workers.costUsd}), 0)`,
        totalToolCalls: sql<number>`COALESCE(SUM(${workers.toolCalls}), 0)`,
        totalErrors: sql<number>`COALESCE(SUM(${workers.errors}), 0)`,
      })
      .from(workers);

    const totalTokensUsed = Number(metricsStats?.totalTokensUsed ?? 0);
    const totalCostUsd = Number(metricsStats?.totalCostUsd ?? 0);
    const totalToolCalls = Number(metricsStats?.totalToolCalls ?? 0);
    const totalErrors = Number(metricsStats?.totalErrors ?? 0);

    // Get traces count from last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [tracesCount] = await this.db
      .select({ count: count() })
      .from(traces)
      .where(gte(traces.timestamp, twentyFourHoursAgo));

    const tracesLast24h = tracesCount?.count ?? 0;

    return {
      totalWorkers,
      activeWorkers,
      totalTokensUsed,
      totalCostUsd,
      totalToolCalls,
      totalErrors,
      tracesLast24h,
    };
  }

  /**
   * Get cost breakdown by time period
   * @param options - Cost query options
   * @returns Array of cost summary entries
   */
  async getCostSummary(options: CostQueryOptions = {}): Promise<CostSummaryEntry[]> {
    const { startTime, endTime, groupBy = "day" } = options;

    // Build time range filter
    const conditions = [];
    if (startTime) {
      conditions.push(gte(traces.timestamp, startTime));
    }
    if (endTime) {
      conditions.push(lte(traces.timestamp, endTime));
    }

    // Determine the SQL date format based on groupBy
    const dateFormat =
      groupBy === "hour"
        ? sql<string>`strftime('%Y-%m-%d %H:00:00', ${traces.timestamp} / 1000, 'unixepoch')`
        : groupBy === "week"
        ? sql<string>`strftime('%Y-W%W', ${traces.timestamp} / 1000, 'unixepoch')`
        : sql<string>`strftime('%Y-%m-%d', ${traces.timestamp} / 1000, 'unixepoch')`;

    // Query traces grouped by time period
    // We'll calculate costs from metric_update events that contain cost data
    let query = this.db
      .select({
        period: dateFormat,
        totalCost: sql<number>`COALESCE(SUM(CAST(json_extract(${traces.data}, '$.costUsd') AS REAL)), 0)`,
        tokenCount: sql<number>`COALESCE(SUM(CAST(json_extract(${traces.data}, '$.tokensUsed') AS INTEGER)), 0)`,
        toolCalls: sql<number>`SUM(CASE WHEN ${traces.eventType} = 'tool_call' THEN 1 ELSE 0 END)`,
      })
      .from(traces)
      .groupBy(dateFormat)
      .orderBy(dateFormat);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const results = await query;

    return results.map((row) => ({
      period: row.period as string,
      totalCost: Number(row.totalCost),
      tokenCount: Number(row.tokenCount),
      toolCalls: Number(row.toolCalls),
    }));
  }

  /**
   * Get tool call statistics
   * @param workerId - Optional worker ID to filter by
   * @returns Tool call statistics
   */
  async getToolCallStats(workerId?: string): Promise<ToolCallStats> {
    // Build condition for optional worker filter
    const condition = workerId
      ? and(eq(traces.eventType, "tool_call"), eq(traces.workerId, workerId))
      : eq(traces.eventType, "tool_call");

    // Get all tool call traces
    const toolCallTraces = await this.db
      .select()
      .from(traces)
      .where(condition);

    const totalCalls = toolCallTraces.length;

    // Count calls by tool name
    const byTool: Record<string, number> = {};
    const workersWithCalls = new Set<string>();

    for (const trace of toolCallTraces) {
      if (trace.data && typeof trace.data === "object" && "toolName" in trace.data) {
        const toolName = String(trace.data.toolName);
        byTool[toolName] = (byTool[toolName] || 0) + 1;
      }

      if (trace.workerId) {
        workersWithCalls.add(trace.workerId);
      }
    }

    const workersWithToolCalls = workersWithCalls.size;
    const averageCallsPerWorker =
      workersWithToolCalls > 0 ? totalCalls / workersWithToolCalls : 0;

    return {
      totalCalls,
      byTool,
      averageCallsPerWorker,
      workersWithToolCalls,
    };
  }

  /**
   * Get trace statistics by event type
   * @param options - Optional query options
   * @returns Object with counts per event type
   */
  async getTraceStatsByEventType(
    options: Pick<TraceQueryOptions, "startTime" | "endTime" | "workerId"> = {}
  ): Promise<Record<TraceEventType, number>> {
    const { startTime, endTime, workerId } = options;

    // Build conditions
    const conditions = [];
    if (startTime) {
      conditions.push(gte(traces.timestamp, startTime));
    }
    if (endTime) {
      conditions.push(lte(traces.timestamp, endTime));
    }
    if (workerId) {
      conditions.push(eq(traces.workerId, workerId));
    }

    // Query grouped by event type
    let query = this.db
      .select({
        eventType: traces.eventType,
        count: count(),
      })
      .from(traces)
      .groupBy(traces.eventType);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const results = await query;

    // Initialize all event types with 0
    const stats: Record<TraceEventType, number> = {
      agent_state: 0,
      work_item_update: 0,
      tool_call: 0,
      metric_update: 0,
      error: 0,
      approval_required: 0,
    };

    // Fill in actual counts
    for (const result of results) {
      stats[result.eventType] = result.count;
    }

    return stats;
  }
}
