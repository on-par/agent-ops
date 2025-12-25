/**
 * React Query hook for Dashboard API
 * Provides queries for dashboard statistics
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { dashboardApi } from '../lib/api-dashboard';
import type { DashboardStats } from '../types/dashboard';

/**
 * Query keys factory for dashboard
 */
export const dashboardKeys = {
  all: ['dashboard'] as const,
  stats: () => [...dashboardKeys.all, 'stats'] as const,
};

/**
 * Parse date fields from API response
 */
function parseDashboardStatsDates(stats: Record<string, unknown>): DashboardStats {
  const agentsData = stats.agents as Record<string, unknown>;
  const workItemsData = stats.workItems as Record<string, unknown>;
  const recentActivityData = stats.recentActivity as Record<string, unknown>[];

  return {
    ...stats,
    agents: {
      ...agentsData,
      items: (agentsData.items as Record<string, unknown>[]).map((item) => ({
        ...item,
        spawnedAt: new Date(item.spawnedAt as string),
      })),
    },
    workItems: {
      ...workItemsData,
      recentCompletions: ((workItemsData?.recentCompletions as Record<string, unknown>[]) || []).map((item) => ({
        ...item,
        createdAt: new Date(item.createdAt as string),
        updatedAt: new Date(item.updatedAt as string),
        startedAt: item.startedAt ? new Date(item.startedAt as string) : undefined,
        completedAt: item.completedAt ? new Date(item.completedAt as string) : undefined,
      })),
    },
    recentActivity: (recentActivityData || []).map((item) => ({
      ...item,
      createdAt: new Date(item.createdAt as string),
      startedAt: item.startedAt ? new Date(item.startedAt as string) : undefined,
      completedAt: item.completedAt ? new Date(item.completedAt as string) : undefined,
    })),
  } as DashboardStats;
}

/**
 * Fetch dashboard statistics
 */
async function fetchDashboardStats(): Promise<DashboardStats> {
  const stats = await dashboardApi.getStats();
  return parseDashboardStatsDates(stats as unknown as Record<string, unknown>);
}

/**
 * Hook to get dashboard statistics with polling
 */
export function useDashboardStats(): UseQueryResult<DashboardStats> {
  return useQuery({
    queryKey: dashboardKeys.stats(),
    queryFn: fetchDashboardStats,
    refetchInterval: 5000, // Poll every 5 seconds
  });
}
