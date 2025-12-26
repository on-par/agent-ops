/**
 * Execution types matching backend ExecutionLog types
 * These types are used for displaying execution logs and traces
 */

/**
 * Agent execution status values
 */
export type ExecutionStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled';

/**
 * Trace event type values
 */
export type TraceEventType =
  | 'agent_state'
  | 'work_item_update'
  | 'tool_call'
  | 'metric_update'
  | 'error'
  | 'approval_required';

/**
 * Agent execution output
 */
export interface AgentExecutionOutput {
  summary?: string;
  filesChanged?: string[];
  testsRun?: boolean;
  testsPassed?: boolean;
  logs?: string[];
  diff?: string;
}

/**
 * Execution list item - minimal data for list display
 */
export interface ExecutionListItem {
  id: string;
  status: ExecutionStatus;
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
  output: AgentExecutionOutput | null;
  traces: TraceEvent[];
}

/**
 * Filters for execution list queries
 */
export interface ExecutionFilters {
  status?: ExecutionStatus;
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
 * Tool call data from trace
 */
export interface ToolCallData {
  name: string;
  input: unknown;
  output: unknown;
  durationMs?: number;
}

/**
 * Error data from trace
 */
export interface ErrorData {
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}
