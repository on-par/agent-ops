/**
 * React Query hooks for Work Items API
 * Provides queries and mutations for work item operations
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import { workItemsApi } from '../lib/api-work-items';
import type { WorkItem } from '../types/dashboard';
import type { CreateWorkItemInput, UpdateWorkItemInput } from '../types/api';

/**
 * Query keys factory for work items
 * Enables efficient cache invalidation
 */
export const workItemKeys = {
  all: ['workItems'] as const,
  lists: () => [...workItemKeys.all, 'list'] as const,
  list: (filters?: { status?: string }) => [...workItemKeys.lists(), filters] as const,
  details: () => [...workItemKeys.all, 'detail'] as const,
  detail: (id: string) => [...workItemKeys.details(), id] as const,
};

/**
 * Parse date fields from API response
 */
function parseWorkItemDates(item: Record<string, unknown>): WorkItem {
  return {
    ...item,
    createdAt: new Date(item.createdAt as string),
    updatedAt: new Date(item.updatedAt as string),
    startedAt: item.startedAt ? new Date(item.startedAt as string) : undefined,
    completedAt: item.completedAt ? new Date(item.completedAt as string) : undefined,
  } as WorkItem;
}

/**
 * Fetch all work items with optional filters
 */
async function fetchWorkItems(filters?: { status?: string }): Promise<WorkItem[]> {
  const items = await workItemsApi.getAll(filters);
  return items.map((item) => parseWorkItemDates(item as unknown as Record<string, unknown>));
}

/**
 * Fetch a single work item
 */
async function fetchWorkItem(id: string): Promise<WorkItem> {
  const item = await workItemsApi.getById(id);
  return parseWorkItemDates(item as unknown as Record<string, unknown>);
}

/**
 * Hook to get all work items with optional filtering
 */
export function useWorkItems(filters?: { status?: string }): UseQueryResult<WorkItem[]> {
  return useQuery({
    queryKey: workItemKeys.list(filters),
    queryFn: () => fetchWorkItems(filters),
    refetchInterval: 5000, // Poll every 5 seconds
  });
}

/**
 * Hook to get a single work item by ID
 */
export function useWorkItem(id?: string): UseQueryResult<WorkItem> {
  return useQuery({
    queryKey: workItemKeys.detail(id || ''),
    queryFn: () => fetchWorkItem(id || ''),
    enabled: !!id,
  });
}

/**
 * Hook to create a new work item
 */
export function useCreateWorkItem(): UseMutationResult<WorkItem, unknown, CreateWorkItemInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => workItemsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workItemKeys.lists() });
    },
  });
}

/**
 * Hook to update an existing work item
 */
export function useUpdateWorkItem(
  id: string
): UseMutationResult<WorkItem, unknown, UpdateWorkItemInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data) => workItemsApi.update(id, data),
    onMutate: async (newData) => {
      // Cancel pending queries
      await queryClient.cancelQueries({ queryKey: workItemKeys.detail(id) });

      // Snapshot previous data
      const previous = queryClient.getQueryData<WorkItem>(workItemKeys.detail(id));

      // Optimistically update
      if (previous) {
        queryClient.setQueryData(workItemKeys.detail(id), {
          ...previous,
          ...newData,
        });
      }

      return { previous };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(workItemKeys.detail(id), context.previous);
      }
    },
    onSettled: () => {
      // Invalidate both detail and list queries
      queryClient.invalidateQueries({ queryKey: workItemKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: workItemKeys.lists() });
    },
  });
}

/**
 * Hook to delete a work item
 */
export function useDeleteWorkItem(
  id: string
): UseMutationResult<void, unknown, void> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => workItemsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workItemKeys.lists() });
      queryClient.removeQueries({ queryKey: workItemKeys.detail(id) });
    },
  });
}

/**
 * Hook to transition a work item to a different status
 */
export function useTransitionWorkItem(
  id: string
): UseMutationResult<WorkItem, unknown, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (newStatus) => workItemsApi.transition(id, newStatus),
    onMutate: async (newStatus) => {
      // Cancel pending queries
      await queryClient.cancelQueries({ queryKey: workItemKeys.detail(id) });

      // Snapshot previous data
      const previous = queryClient.getQueryData<WorkItem>(workItemKeys.detail(id));

      // Optimistically update the status
      if (previous) {
        queryClient.setQueryData(workItemKeys.detail(id), {
          ...previous,
          status: newStatus as WorkItem['status'],
        });
      }

      return { previous };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(workItemKeys.detail(id), context.previous);
      }
    },
    onSettled: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: workItemKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: workItemKeys.lists() });
    },
  });
}
