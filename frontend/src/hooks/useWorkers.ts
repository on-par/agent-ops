// React Query hooks for Workers

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, parseApiDates } from "../lib/api";
import type { Worker, SpawnWorkerDTO, ControlWorkerDTO } from "../types";
import { useWorkerStore } from "../stores/workerStore";

// ============================================================================
// Query Keys
// ============================================================================

export const workerKeys = {
  all: ["workers"] as const,
  lists: () => [...workerKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...workerKeys.lists(), filters] as const,
  details: () => [...workerKeys.all, "detail"] as const,
  detail: (id: string) => [...workerKeys.details(), id] as const,
};

// ============================================================================
// API Functions
// ============================================================================

async function fetchWorkers(): Promise<Worker[]> {
  const workers = await api.get<Worker[]>("/workers");
  return workers.map((worker) => parseApiDates(worker, ["spawnedAt"]));
}

async function fetchWorker(id: string): Promise<Worker> {
  const worker = await api.get<Worker>(`/workers/${id}`);
  return parseApiDates(worker, ["spawnedAt"]);
}

async function spawnWorker(data: SpawnWorkerDTO): Promise<Worker> {
  const worker = await api.post<Worker>("/workers", data);
  return parseApiDates(worker, ["spawnedAt"]);
}

async function controlWorker(
  id: string,
  action: ControlWorkerDTO
): Promise<Worker> {
  const worker = await api.post<Worker>(`/workers/${id}/control`, action);
  return parseApiDates(worker, ["spawnedAt"]);
}

async function terminateWorker(id: string): Promise<void> {
  await api.delete(`/workers/${id}`);
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch all workers
 */
export function useWorkers() {
  const setWorkers = useWorkerStore((state) => state.setWorkers);

  const query = useQuery({
    queryKey: workerKeys.lists(),
    queryFn: fetchWorkers,
    staleTime: 30000, // 30 seconds
  });

  // Update store when data changes
  if (query.data) {
    setWorkers(query.data);
  }

  return query;
}

/**
 * Fetch a single worker by ID
 */
export function useWorker(id: string) {
  const updateWorker = useWorkerStore((state) => state.updateWorker);

  const query = useQuery({
    queryKey: workerKeys.detail(id),
    queryFn: () => fetchWorker(id),
    enabled: !!id,
    staleTime: 30000,
  });

  // Update store when data changes
  if (query.data) {
    updateWorker(id, query.data);
  }

  return query;
}

/**
 * Spawn a new worker
 */
export function useSpawnWorker() {
  const queryClient = useQueryClient();
  const addWorker = useWorkerStore((state) => state.addWorker);

  return useMutation({
    mutationFn: spawnWorker,
    onSuccess: (data) => {
      // Invalidate and refetch workers list
      queryClient.invalidateQueries({ queryKey: workerKeys.lists() });
      // Add to store
      addWorker(data);
    },
  });
}

/**
 * Control a worker (pause, resume, terminate)
 */
export function useControlWorker() {
  const queryClient = useQueryClient();
  const updateWorker = useWorkerStore((state) => state.updateWorker);

  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: ControlWorkerDTO }) =>
      controlWorker(id, action),
    onSuccess: (data, variables) => {
      // Invalidate specific worker and list
      queryClient.invalidateQueries({
        queryKey: workerKeys.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: workerKeys.lists() });
      // Update store
      updateWorker(variables.id, data);
    },
  });
}

/**
 * Terminate a worker
 */
export function useTerminateWorker() {
  const queryClient = useQueryClient();
  const removeWorker = useWorkerStore((state) => state.removeWorker);

  return useMutation({
    mutationFn: terminateWorker,
    onSuccess: (_, id) => {
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: workerKeys.lists() });
      queryClient.removeQueries({ queryKey: workerKeys.detail(id) });
      // Remove from store
      removeWorker(id);
    },
  });
}

/**
 * Pause a worker
 */
export function usePauseWorker() {
  const controlWorker = useControlWorker();

  return {
    ...controlWorker,
    mutate: (id: string) =>
      controlWorker.mutate({ id, action: { action: "pause" } }),
    mutateAsync: (id: string) =>
      controlWorker.mutateAsync({ id, action: { action: "pause" } }),
  };
}

/**
 * Resume a worker
 */
export function useResumeWorker() {
  const controlWorker = useControlWorker();

  return {
    ...controlWorker,
    mutate: (id: string) =>
      controlWorker.mutate({ id, action: { action: "resume" } }),
    mutateAsync: (id: string) =>
      controlWorker.mutateAsync({ id, action: { action: "resume" } }),
  };
}
