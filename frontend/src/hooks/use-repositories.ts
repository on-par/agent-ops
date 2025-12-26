import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE } from '../lib/api';
import type { Repository, AvailableRepository, RepositoryConnectInput, RepositoryUpdateInput } from '../types/github';

// Query Keys
export const repositoriesKeys = {
  all: ['repositories'] as const,
  lists: () => [...repositoriesKeys.all, 'list'] as const,
  available: (connectionId: string) => [...repositoriesKeys.all, 'available', connectionId] as const,
  details: () => [...repositoriesKeys.all, 'detail'] as const,
  detail: (id: string) => [...repositoriesKeys.details(), id] as const,
};

// Fetch functions
async function fetchRepositories(): Promise<Repository[]> {
  const response = await fetch(`${API_BASE}/api/repositories`);
  if (!response.ok) {
    throw new Error('Failed to fetch repositories');
  }
  return response.json();
}

async function fetchAvailableRepositories(
  connectionId: string,
  params?: { page?: number; perPage?: number }
): Promise<AvailableRepository[]> {
  const url = new URL(`${API_BASE}/api/repositories/available/${connectionId}`);
  if (params?.page) url.searchParams.set('page', String(params.page));
  if (params?.perPage) url.searchParams.set('perPage', String(params.perPage));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error('Failed to fetch available repositories');
  }
  return response.json();
}

async function connectRepository(input: RepositoryConnectInput): Promise<Repository> {
  const response = await fetch(`${API_BASE}/api/repositories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error('Failed to connect repository');
  }

  return response.json();
}

async function updateRepository(id: string, data: RepositoryUpdateInput): Promise<Repository> {
  const response = await fetch(`${API_BASE}/api/repositories/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error('Failed to update repository');
  }

  return response.json();
}

async function disconnectRepository(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/repositories/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to disconnect repository');
  }
}

async function syncRepository(id: string): Promise<{ jobId: string; repositoryId: string }> {
  const response = await fetch(`${API_BASE}/api/repositories/${id}/sync`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to sync repository');
  }

  return response.json();
}

// Query Options
export const repositoriesQueryOptions = () =>
  queryOptions({
    queryKey: repositoriesKeys.lists(),
    queryFn: fetchRepositories,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

// Hooks
export function useRepositories() {
  return useQuery(repositoriesQueryOptions());
}

export function useAvailableRepositories(connectionId: string, params?: { page?: number; perPage?: number }) {
  return useQuery({
    queryKey: [...repositoriesKeys.available(connectionId), params],
    queryFn: () => fetchAvailableRepositories(connectionId, params),
    enabled: !!connectionId,
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}

export function useConnectRepository() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: connectRepository,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repositoriesKeys.lists() });
    },
  });
}

export function useUpdateRepository() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: RepositoryUpdateInput }) =>
      updateRepository(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: repositoriesKeys.lists() });
      queryClient.invalidateQueries({ queryKey: repositoriesKeys.detail(data.id) });
    },
  });
}

export function useDisconnectRepository() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: disconnectRepository,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: repositoriesKeys.lists() });
    },
  });
}

export function useSyncRepository() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: syncRepository,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: repositoriesKeys.detail(data.repositoryId) });
      queryClient.invalidateQueries({ queryKey: repositoriesKeys.lists() });
    },
  });
}
