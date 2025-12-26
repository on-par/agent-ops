import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE } from '../lib/api';
import type { GitHubConnection } from '../types/github';

// Query Keys
export const githubConnectionsKeys = {
  all: ['githubConnections'] as const,
  lists: () => [...githubConnectionsKeys.all, 'list'] as const,
  details: () => [...githubConnectionsKeys.all, 'detail'] as const,
  detail: (id: string) => [...githubConnectionsKeys.details(), id] as const,
};

// Fetch functions
async function fetchGitHubConnections(): Promise<GitHubConnection[]> {
  const response = await fetch(`${API_BASE}/api/auth/github/connections`);
  if (!response.ok) {
    throw new Error('Failed to fetch GitHub connections');
  }
  return response.json();
}

async function deleteGitHubConnection(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/auth/github/connections/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete GitHub connection');
  }
}

// Query Options
export const githubConnectionsQueryOptions = () =>
  queryOptions({
    queryKey: githubConnectionsKeys.lists(),
    queryFn: fetchGitHubConnections,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

// Hooks
export function useGitHubConnections() {
  return useQuery(githubConnectionsQueryOptions());
}

export function useDeleteGitHubConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteGitHubConnection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: githubConnectionsKeys.lists() });
    },
  });
}

/**
 * Initiates GitHub OAuth flow by redirecting to backend endpoint
 */
export function initiateGitHubOAuth(): void {
  window.location.href = `${API_BASE}/api/auth/github`;
}
