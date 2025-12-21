// React Query hooks for Work Items

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, parseApiDates } from "../lib/api";
import type {
  WorkItem,
  CreateWorkItemDTO,
  UpdateWorkItemDTO,
} from "../types";
import { useWorkItemStore } from "../stores/workItemStore";

// ============================================================================
// Query Keys
// ============================================================================

export const workItemKeys = {
  all: ["workItems"] as const,
  lists: () => [...workItemKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...workItemKeys.lists(), filters] as const,
  details: () => [...workItemKeys.all, "detail"] as const,
  detail: (id: string) => [...workItemKeys.details(), id] as const,
};

// ============================================================================
// API Functions
// ============================================================================

async function fetchWorkItems(): Promise<WorkItem[]> {
  const items = await api.get<WorkItem[]>("/work-items");
  return items.map((item) =>
    parseApiDates(item, [
      "createdAt",
      "updatedAt",
      "startedAt",
      "completedAt",
    ])
  );
}

async function fetchWorkItem(id: string): Promise<WorkItem> {
  const item = await api.get<WorkItem>(`/work-items/${id}`);
  return parseApiDates(item, [
    "createdAt",
    "updatedAt",
    "startedAt",
    "completedAt",
  ]);
}

async function createWorkItem(data: CreateWorkItemDTO): Promise<WorkItem> {
  const item = await api.post<WorkItem>("/work-items", data);
  return parseApiDates(item, [
    "createdAt",
    "updatedAt",
    "startedAt",
    "completedAt",
  ]);
}

async function updateWorkItem(
  id: string,
  data: UpdateWorkItemDTO
): Promise<WorkItem> {
  const item = await api.patch<WorkItem>(`/work-items/${id}`, data);
  return parseApiDates(item, [
    "createdAt",
    "updatedAt",
    "startedAt",
    "completedAt",
  ]);
}

async function deleteWorkItem(id: string): Promise<void> {
  await api.delete(`/work-items/${id}`);
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch all work items
 */
export function useWorkItems() {
  const setItems = useWorkItemStore((state) => state.setItems);

  const query = useQuery({
    queryKey: workItemKeys.lists(),
    queryFn: fetchWorkItems,
    staleTime: 30000, // 30 seconds
  });

  // Update store when data changes
  if (query.data) {
    setItems(query.data);
  }

  return query;
}

/**
 * Fetch a single work item by ID
 */
export function useWorkItem(id: string) {
  const updateItem = useWorkItemStore((state) => state.updateItem);

  const query = useQuery({
    queryKey: workItemKeys.detail(id),
    queryFn: () => fetchWorkItem(id),
    enabled: !!id,
    staleTime: 30000,
  });

  // Update store when data changes
  if (query.data) {
    updateItem(id, query.data);
  }

  return query;
}

/**
 * Create a new work item
 */
export function useCreateWorkItem() {
  const queryClient = useQueryClient();
  const addItem = useWorkItemStore((state) => state.addItem);

  return useMutation({
    mutationFn: createWorkItem,
    onSuccess: (data) => {
      // Invalidate and refetch work items list
      queryClient.invalidateQueries({ queryKey: workItemKeys.lists() });
      // Add to store
      addItem(data);
    },
  });
}

/**
 * Update an existing work item
 */
export function useUpdateWorkItem() {
  const queryClient = useQueryClient();
  const updateItem = useWorkItemStore((state) => state.updateItem);

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateWorkItemDTO }) =>
      updateWorkItem(id, data),
    onSuccess: (data, variables) => {
      // Invalidate specific work item and list
      queryClient.invalidateQueries({
        queryKey: workItemKeys.detail(variables.id),
      });
      queryClient.invalidateQueries({ queryKey: workItemKeys.lists() });
      // Update store
      updateItem(variables.id, data);
    },
  });
}

/**
 * Delete a work item
 */
export function useDeleteWorkItem() {
  const queryClient = useQueryClient();
  const removeItem = useWorkItemStore((state) => state.removeItem);

  return useMutation({
    mutationFn: deleteWorkItem,
    onSuccess: (_, id) => {
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: workItemKeys.lists() });
      queryClient.removeQueries({ queryKey: workItemKeys.detail(id) });
      // Remove from store
      removeItem(id);
    },
  });
}

/**
 * Bulk update work item status (useful for drag-and-drop)
 */
export function useUpdateWorkItemStatus() {
  const queryClient = useQueryClient();
  const updateItemStatus = useWorkItemStore((state) => state.updateItemStatus);

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: WorkItem["status"] }) =>
      updateWorkItem(id, { status }),
    onMutate: async ({ id, status }) => {
      // Optimistically update the UI
      await queryClient.cancelQueries({ queryKey: workItemKeys.detail(id) });

      const previousItem = queryClient.getQueryData<WorkItem>(
        workItemKeys.detail(id)
      );

      if (previousItem) {
        queryClient.setQueryData<WorkItem>(workItemKeys.detail(id), {
          ...previousItem,
          status,
        });
      }

      updateItemStatus(id, status);

      return { previousItem };
    },
    onError: (_err, { id }, context) => {
      // Rollback on error
      if (context?.previousItem) {
        queryClient.setQueryData(
          workItemKeys.detail(id),
          context.previousItem
        );
        updateItemStatus(id, context.previousItem.status);
      }
    },
    onSettled: (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: workItemKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: workItemKeys.lists() });
    },
  });
}
