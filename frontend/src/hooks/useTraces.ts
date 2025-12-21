// React Query hooks for Traces

import { useQuery } from "@tanstack/react-query";
import { api, parseApiDates } from "../lib/api";
import type { Trace, TraceEventType } from "../types";

// ============================================================================
// Query Keys
// ============================================================================

export const traceKeys = {
  all: ["traces"] as const,
  lists: () => [...traceKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...traceKeys.lists(), filters] as const,
  byWorker: (workerId: string) =>
    [...traceKeys.lists(), { workerId }] as const,
  byWorkItem: (workItemId: string) =>
    [...traceKeys.lists(), { workItemId }] as const,
  byEventType: (eventType: TraceEventType) =>
    [...traceKeys.lists(), { eventType }] as const,
};

// ============================================================================
// API Functions
// ============================================================================

interface FetchTracesParams {
  workerId?: string;
  workItemId?: string;
  eventType?: TraceEventType;
  limit?: number;
  offset?: number;
}

async function fetchTraces(params?: FetchTracesParams): Promise<Trace[]> {
  const queryParams: Record<string, string> = {};

  if (params?.workerId) queryParams.workerId = params.workerId;
  if (params?.workItemId) queryParams.workItemId = params.workItemId;
  if (params?.eventType) queryParams.eventType = params.eventType;
  if (params?.limit) queryParams.limit = String(params.limit);
  if (params?.offset) queryParams.offset = String(params.offset);

  const traces = await api.get<Trace[]>("/traces", queryParams);
  return traces.map((trace) => parseApiDates(trace, ["timestamp"]));
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch all traces with optional filters
 */
export function useTraces(params?: FetchTracesParams) {
  return useQuery({
    queryKey: traceKeys.list(params as Record<string, unknown> | undefined),
    queryFn: () => fetchTraces(params),
    staleTime: 10000, // 10 seconds (traces are read-only and frequently updated)
    refetchInterval: 30000, // Auto-refetch every 30 seconds
  });
}

/**
 * Fetch traces for a specific worker
 */
export function useWorkerTraces(workerId: string, limit = 100) {
  return useQuery({
    queryKey: traceKeys.byWorker(workerId),
    queryFn: () => fetchTraces({ workerId, limit }),
    enabled: !!workerId,
    staleTime: 10000,
    refetchInterval: 15000, // More frequent for active worker
  });
}

/**
 * Fetch traces for a specific work item
 */
export function useWorkItemTraces(workItemId: string, limit = 100) {
  return useQuery({
    queryKey: traceKeys.byWorkItem(workItemId),
    queryFn: () => fetchTraces({ workItemId, limit }),
    enabled: !!workItemId,
    staleTime: 10000,
    refetchInterval: 15000,
  });
}

/**
 * Fetch traces by event type
 */
export function useTracesByEventType(eventType: TraceEventType, limit = 50) {
  return useQuery({
    queryKey: traceKeys.byEventType(eventType),
    queryFn: () => fetchTraces({ eventType, limit }),
    enabled: !!eventType,
    staleTime: 10000,
    refetchInterval: 30000,
  });
}

/**
 * Fetch error traces (for monitoring)
 */
export function useErrorTraces(limit = 50) {
  return useTracesByEventType("error", limit);
}

/**
 * Fetch approval required traces
 */
export function useApprovalTraces(limit = 20) {
  return useTracesByEventType("approval_required", limit);
}
