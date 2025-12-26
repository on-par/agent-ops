import { queryOptions, useQuery } from '@tanstack/react-query';
import { API_BASE } from '../lib/api';
import type {
  ExecutionListResponse,
  ExecutionDetail,
  ExecutionFilters,
  ExecutionListItem,
  TraceEvent,
} from '../types/execution';

// Query keys
export const executionKeys = {
  all: ['executions'] as const,
  lists: () => [...executionKeys.all, 'list'] as const,
  list: (filters: ExecutionFilters) => [...executionKeys.lists(), filters] as const,
  details: () => [...executionKeys.all, 'detail'] as const,
  detail: (id: string) => [...executionKeys.details(), id] as const,
  traces: (id: string) => [...executionKeys.detail(id), 'traces'] as const,
};

// Date parsing helpers
function parseExecutionDates(execution: Record<string, unknown>): ExecutionListItem {
  return {
    ...execution,
    startedAt: execution.startedAt ? new Date(execution.startedAt as string) : null,
    completedAt: execution.completedAt ? new Date(execution.completedAt as string) : null,
    createdAt: new Date(execution.createdAt as string),
  } as ExecutionListItem;
}

function parseTraceDates(trace: Record<string, unknown>): TraceEvent {
  return {
    ...trace,
    timestamp: new Date(trace.timestamp as string),
  } as TraceEvent;
}

// Fetch executions list
async function fetchExecutions(filters: ExecutionFilters = {}): Promise<ExecutionListResponse> {
  const params = new URLSearchParams();

  if (filters.status) params.append('status', filters.status);
  if (filters.workerId) params.append('workerId', filters.workerId);
  if (filters.workItemId) params.append('workItemId', filters.workItemId);
  if (filters.dateFrom) params.append('dateFrom', filters.dateFrom.toISOString());
  if (filters.dateTo) params.append('dateTo', filters.dateTo.toISOString());
  if (filters.limit) params.append('limit', filters.limit.toString());
  if (filters.offset) params.append('offset', filters.offset.toString());

  const url = `${API_BASE}/api/executions${params.toString() ? `?${params.toString()}` : ''}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch executions');
  }

  const data = await response.json();

  // Convert date strings to Date objects
  return {
    ...data,
    items: data.items.map(parseExecutionDates),
  };
}

// Fetch single execution with traces
async function fetchExecution(id: string): Promise<ExecutionDetail> {
  const response = await fetch(`${API_BASE}/api/executions/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch execution');
  }

  const data = await response.json();

  // Convert date strings to Date objects
  return {
    ...parseExecutionDates(data),
    output: data.output,
    traces: data.traces.map(parseTraceDates),
  };
}

// Fetch traces for an execution
async function fetchExecutionTraces(
  id: string,
  filters: { eventType?: string } = {}
): Promise<TraceEvent[]> {
  const params = new URLSearchParams();
  if (filters.eventType) params.append('eventType', filters.eventType);

  const url = `${API_BASE}/api/executions/${id}/traces${params.toString() ? `?${params.toString()}` : ''}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch traces');
  }

  const data = await response.json();

  // Convert date strings to Date objects
  return data.map(parseTraceDates);
}

/**
 * Query options for fetching execution list with optional filtering
 */
export const executionsOptions = (filters: ExecutionFilters = {}) => queryOptions({
  queryKey: executionKeys.list(filters),
  queryFn: () => fetchExecutions(filters),
  refetchInterval: 5000, // Poll every 5 seconds
});

/**
 * Query options for fetching a single execution with traces
 */
export const executionOptions = (id: string) => queryOptions({
  queryKey: executionKeys.detail(id),
  queryFn: () => fetchExecution(id),
  enabled: !!id,
  refetchInterval: (query) => {
    // Poll every 2 seconds if execution is running
    const data = query.state.data;
    return data?.status === 'running' ? 2000 : false;
  },
});

/**
 * Query options for fetching traces for an execution
 */
export const executionTracesOptions = (id: string, filters: { eventType?: string } = {}) => queryOptions({
  queryKey: executionKeys.traces(id),
  queryFn: () => fetchExecutionTraces(id, filters),
  enabled: !!id,
});

/**
 * Hook to fetch execution list with optional filtering
 * Polls every 5 seconds to keep data fresh
 */
export function useExecutions(filters: ExecutionFilters = {}) {
  return useQuery(executionsOptions(filters));
}

/**
 * Hook to fetch a single execution with traces
 * Polls while execution is running
 */
export function useExecution(id: string) {
  return useQuery(executionOptions(id));
}

/**
 * Hook to fetch traces for an execution with optional filtering
 */
export function useExecutionTraces(id: string, filters: { eventType?: string } = {}) {
  return useQuery(executionTracesOptions(id, filters));
}
