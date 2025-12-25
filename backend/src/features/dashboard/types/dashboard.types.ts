import type { WorkItem, AgentExecution } from "../../../shared/db/schema.js";

/**
 * Repository statistics aggregated by sync status
 */
export interface RepositoryStats {
  pending: number;
  syncing: number;
  synced: number;
  error: number;
}

/**
 * Agent/Worker statistics aggregated by worker status
 */
export interface AgentStats {
  idle: number;
  working: number;
  paused: number;
  error: number;
  terminated: number;
}

/**
 * Work item statistics aggregated by status
 */
export interface WorkItemStats {
  backlog: number;
  ready: number;
  in_progress: number;
  review: number;
  done: number;
}

/**
 * Complete dashboard data aggregating all statistics
 */
export interface DashboardData {
  repositories: RepositoryStats;
  agents: AgentStats;
  workItems: WorkItemStats;
  recentCompletions: WorkItem[];
  recentExecutions: AgentExecution[];
}

/**
 * Cached dashboard data with timestamp
 */
export interface CachedDashboardData {
  data: DashboardData;
  cachedAt: Date;
}
