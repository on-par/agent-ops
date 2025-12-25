/**
 * Agent/Worker metrics data structure
 */
export interface AgentMetricsData {
  workerId: string;
  status: "active" | "idle" | "offline";
  templateId: string;
  currentWorkload: {
    activeTasks: number;
    pendingTasks: number;
    completedToday: number;
  };
  performance: {
    avgExecutionTimeMs: number;
    successRate: number;
    totalExecutions: number;
  };
  lastActivity: string;
}

/**
 * Response structure for agent metrics endpoint
 */
export interface AgentMetricsResponse {
  data: AgentMetricsData[];
  metadata: {
    count: number;
    limit: number;
    offset: number;
  };
}

/**
 * Work item metrics data
 */
export interface WorkMetricsData {
  totalCount: number;
  byStatus: {
    pending: number;
    in_progress: number;
    completed: number;
    failed: number;
  };
  byType: Record<string, number>;
  avgCompletionTimeMs: number;
}

/**
 * Response structure for work metrics endpoint
 */
export interface WorkMetricsResponse {
  data: WorkMetricsData;
  metadata: {
    dateRange?: { start: string; end: string };
  };
}

/**
 * System-wide metrics data
 */
export interface SystemMetricsData {
  workers: {
    total: number;
    active: number;
    idle: number;
    offline: number;
  };
  workItems: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
  };
  traces: {
    totalCount: number;
    last24Hours: number;
    errorCount: number;
  };
  system: {
    totalTokens: number;
    totalCost: number;
    totalToolCalls: number;
    avgExecutionTimeMs: number;
  };
}

/**
 * Response structure for system metrics endpoint
 */
export interface SystemMetricsResponse {
  data: SystemMetricsData;
  metadata: { timestamp: string };
}

/**
 * Individual trace event data
 */
export interface TraceData {
  id: string;
  eventType: string;
  timestamp: string;
  workerId?: string;
  workItemId?: string;
  metadata: Record<string, unknown>;
  spanId?: string;
  traceId?: string;
}

/**
 * Response structure for traces endpoint
 */
export interface TracesResponse {
  data: TraceData[];
  metadata: {
    count: number;
    limit: number;
    offset: number;
    timeRange?: { start: string; end: string };
  };
}

/**
 * Cached metrics with timestamp
 */
export interface CachedMetrics<T> {
  data: T;
  cachedAt: Date;
}

/**
 * Query filters for agent metrics
 */
export interface AgentMetricsFilters {
  templateId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

/**
 * Query filters for work metrics
 */
export interface WorkMetricsFilters {
  startDate?: Date;
  endDate?: Date;
  type?: string;
}

/**
 * Query filters for traces
 */
export interface TracesFilters {
  workerId?: string;
  workItemId?: string;
  eventType?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}
