import type {
  AgentExecution,
  AgentExecutionStatus,
  TraceEventType,
} from "../../../shared/db/schema.js";

/**
 * Execution list item - minimal data for list display
 */
export interface ExecutionListItem {
  id: string;
  status: AgentExecutionStatus;
  workerId: string | null;
  workItemId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  tokensUsed: number;
  errorMessage: string | null;
  createdAt: Date;
}

/**
 * Trace event from traces table
 */
export interface TraceEvent {
  id: string;
  eventType: TraceEventType;
  data: unknown;
  timestamp: Date;
}

/**
 * Execution detail with associated traces
 */
export interface ExecutionDetail extends ExecutionListItem {
  output: AgentExecution["output"];
  traces: TraceEvent[];
}

/**
 * Filters for execution list queries
 */
export interface ExecutionFilters {
  status?: AgentExecutionStatus;
  workerId?: string;
  workItemId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Paginated execution list response
 */
export interface ExecutionListResponse {
  items: ExecutionListItem[];
  total: number;
  hasMore: boolean;
}

/**
 * Filters for trace queries
 */
export interface TraceFilters {
  eventType?: TraceEventType;
}
