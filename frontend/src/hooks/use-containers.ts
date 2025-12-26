import { queryOptions, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_BASE } from '../lib/api';
import type {
  ContainerListResponse,
  Container,
  ContainerFilters,
  ContainerListItem,
  ContainerCreateInput,
} from '../types/container';

// Query keys
export const containerKeys = {
  all: ['containers'] as const,
  lists: () => [...containerKeys.all, 'list'] as const,
  list: (filters: ContainerFilters) => [...containerKeys.lists(), filters] as const,
  details: () => [...containerKeys.all, 'detail'] as const,
  detail: (id: string) => [...containerKeys.details(), id] as const,
};

// Date parsing helpers
function parseContainerDates(container: Record<string, unknown>): ContainerListItem {
  return {
    ...container,
    createdAt: new Date(container.createdAt as string),
    startedAt: container.startedAt ? new Date(container.startedAt as string) : null,
    stoppedAt: container.stoppedAt ? new Date(container.stoppedAt as string) : null,
  } as ContainerListItem;
}

function parseContainerDetailDates(container: Record<string, unknown>): Container {
  return {
    ...container,
    createdAt: new Date(container.createdAt as string),
    startedAt: container.startedAt ? new Date(container.startedAt as string) : null,
    stoppedAt: container.stoppedAt ? new Date(container.stoppedAt as string) : null,
    updatedAt: new Date(container.updatedAt as string),
  } as Container;
}

// Fetch containers list
async function fetchContainers(filters: ContainerFilters = {}): Promise<ContainerListResponse> {
  const params = new URLSearchParams();

  if (filters.status) params.append('status', filters.status);
  if (filters.workspaceId) params.append('workspaceId', filters.workspaceId);
  if (filters.executionId) params.append('executionId', filters.executionId);
  if (filters.limit) params.append('limit', filters.limit.toString());
  if (filters.offset) params.append('offset', filters.offset.toString());

  const url = `${API_BASE}/api/containers${params.toString() ? `?${params.toString()}` : ''}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch containers');
  }

  const data = await response.json();

  // Convert date strings to Date objects
  return {
    ...data,
    items: data.items.map(parseContainerDates),
  };
}

// Fetch single container
async function fetchContainer(id: string): Promise<Container> {
  const response = await fetch(`${API_BASE}/api/containers/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch container');
  }

  const data = await response.json();

  // Convert date strings to Date objects
  return parseContainerDetailDates(data);
}

// Create container
async function createContainer(input: ContainerCreateInput): Promise<Container> {
  const response = await fetch(`${API_BASE}/api/containers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to create container' }));
    throw new Error(error.message || 'Failed to create container');
  }

  const data = await response.json();
  return parseContainerDetailDates(data);
}

// Start container
async function startContainer(id: string): Promise<Container> {
  const response = await fetch(`${API_BASE}/api/containers/${id}/start`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to start container' }));
    throw new Error(error.message || 'Failed to start container');
  }

  const data = await response.json();
  return parseContainerDetailDates(data);
}

// Stop container
async function stopContainer(id: string): Promise<Container> {
  const response = await fetch(`${API_BASE}/api/containers/${id}/stop`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to stop container' }));
    throw new Error(error.message || 'Failed to stop container');
  }

  const data = await response.json();
  return parseContainerDetailDates(data);
}

// Delete container
async function deleteContainer(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/containers/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to delete container' }));
    throw new Error(error.message || 'Failed to delete container');
  }
}

/**
 * Query options for fetching container list with optional filtering
 */
export const containersOptions = (filters: ContainerFilters = {}) => queryOptions({
  queryKey: containerKeys.list(filters),
  queryFn: () => fetchContainers(filters),
  refetchInterval: 5000, // Poll every 5 seconds
});

/**
 * Query options for fetching a single container
 * Polls while container is running or in transitional states
 */
export const containerOptions = (id: string) => queryOptions({
  queryKey: containerKeys.detail(id),
  queryFn: () => fetchContainer(id),
  enabled: !!id,
  refetchInterval: (query) => {
    // Poll every 3 seconds if container is running or in transitional state
    const data = query.state.data;
    return data?.status === 'running' || data?.status === 'created' ? 3000 : false;
  },
});

/**
 * Hook to fetch container list with optional filtering
 * Polls every 5 seconds to keep data fresh
 */
export function useContainers(filters: ContainerFilters = {}) {
  return useQuery(containersOptions(filters));
}

/**
 * Hook to fetch a single container
 * Polls while container is running or in transitional states
 */
export function useContainer(id: string) {
  return useQuery(containerOptions(id));
}

/**
 * Hook to create a new container
 */
export function useCreateContainer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createContainer,
    onSuccess: () => {
      // Invalidate all container lists to refetch with new data
      queryClient.invalidateQueries({ queryKey: containerKeys.lists() });
    },
  });
}

/**
 * Hook to start a container
 */
export function useStartContainer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: startContainer,
    onSuccess: (data) => {
      // Invalidate container lists and detail
      queryClient.invalidateQueries({ queryKey: containerKeys.lists() });
      queryClient.invalidateQueries({ queryKey: containerKeys.detail(data.id) });
    },
  });
}

/**
 * Hook to stop a container
 */
export function useStopContainer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: stopContainer,
    onSuccess: (data) => {
      // Invalidate container lists and detail
      queryClient.invalidateQueries({ queryKey: containerKeys.lists() });
      queryClient.invalidateQueries({ queryKey: containerKeys.detail(data.id) });
    },
  });
}

/**
 * Hook to delete a container
 */
export function useDeleteContainer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteContainer,
    onSuccess: () => {
      // Invalidate all container lists to refetch without deleted container
      queryClient.invalidateQueries({ queryKey: containerKeys.lists() });
    },
  });
}
