/**
 * React Query hooks for Workers API
 * Provides queries and mutations for worker/agent operations
 */

import {
  queryOptions,
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { workersApi } from '../lib/api-workers';
import type { Worker } from '../types/dashboard';
import type { SpawnWorkerInput } from '../types/api';

/**
 * Query keys factory for workers
 */
export const workerKeys = {
  all: ['workers'] as const,
  lists: () => [...workerKeys.all, 'list'] as const,
  list: () => [...workerKeys.lists()] as const,
  details: () => [...workerKeys.all, 'detail'] as const,
  detail: (id: string) => [...workerKeys.details(), id] as const,
};

/**
 * Parse date fields from API response
 */
function parseWorkerDates(item: Record<string, unknown>): Worker {
  return {
    ...item,
    spawnedAt: new Date(item.spawnedAt as string),
  } as Worker;
}

/**
 * Fetch worker pool
 */
async function fetchWorkerPool(): Promise<Worker[]> {
  const workers = await workersApi.getPool();
  return workers.map((worker) => parseWorkerDates(worker as unknown as Record<string, unknown>));
}

/**
 * Fetch single worker
 */
async function fetchWorker(id: string): Promise<Worker> {
  const worker = await workersApi.getById(id);
  return parseWorkerDates(worker as unknown as Record<string, unknown>);
}

/**
 * Query options for fetching all workers in the pool
 */
export const workerPoolOptions = () => queryOptions({
  queryKey: workerKeys.list(),
  queryFn: fetchWorkerPool,
  refetchInterval: 3000, // Poll every 3 seconds for active workers
});

/**
 * Query options for fetching a single worker by ID
 */
export const workerOptions = (id: string) => queryOptions({
  queryKey: workerKeys.detail(id),
  queryFn: () => fetchWorker(id),
  enabled: !!id,
});

/**
 * Hook to get all workers in the pool
 */
export function useWorkerPool(): UseQueryResult<Worker[]> {
  return useQuery(workerPoolOptions());
}

/**
 * Hook to get a single worker by ID
 */
export function useWorker(id?: string): UseQueryResult<Worker> {
  return useQuery(workerOptions(id || ''));
}

/**
 * Hook to spawn a new worker
 */
export function useSpawnWorker(): UseMutationResult<Worker, unknown, SpawnWorkerInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => workersApi.spawn(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workerKeys.list() });
    },
  });
}

/**
 * Hook to pause a worker
 */
export function usePauseWorker(id: string): UseMutationResult<Worker, unknown, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => workersApi.pause(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workerKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: workerKeys.list() });
    },
  });
}

/**
 * Hook to resume a paused worker
 */
export function useResumeWorker(id: string): UseMutationResult<Worker, unknown, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => workersApi.resume(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workerKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: workerKeys.list() });
    },
  });
}

/**
 * Hook to terminate a worker
 */
export function useTerminateWorker(id: string): UseMutationResult<void, unknown, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => workersApi.terminate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workerKeys.list() });
      queryClient.removeQueries({ queryKey: workerKeys.detail(id) });
    },
  });
}
