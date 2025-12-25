import type { DrizzleDatabase } from "../../../shared/db/index.js";
import { RepositoryRepository } from "../../repositories/repositories/repository.repository.js";
import { WorkItemRepository } from "../../work-items/repositories/work-item.repository.js";
import { WorkerRepository } from "../../workers/repositories/worker.repository.js";
import { AgentExecutionRepository } from "../../agent-runtime/repositories/agent-execution.repository.js";
import type {
  DashboardData,
  CachedDashboardData,
  RepositoryStats,
  AgentStats,
  WorkItemStats,
} from "../types/dashboard.types.js";

/**
 * Service for aggregating dashboard statistics with caching
 * Implements 5-second cache TTL to minimize database queries
 */
export class DashboardService {
  private repositoryRepository: RepositoryRepository;
  private workItemRepository: WorkItemRepository;
  private workerRepository: WorkerRepository;
  private agentExecutionRepository: AgentExecutionRepository;
  private cache: CachedDashboardData | null = null;
  private readonly CACHE_TTL_MS = 5000; // 5 seconds

  constructor(db: DrizzleDatabase) {
    this.repositoryRepository = new RepositoryRepository(db);
    this.workItemRepository = new WorkItemRepository(db);
    this.workerRepository = new WorkerRepository(db);
    this.agentExecutionRepository = new AgentExecutionRepository(db);
  }

  /**
   * Get aggregated dashboard data with caching
   * Returns cached data if available and not expired (5s TTL)
   * @returns Complete dashboard statistics
   */
  async getDashboardData(): Promise<DashboardData> {
    // Check if cache is valid
    if (this.isCacheValid()) {
      return this.cache!.data;
    }

    // Fetch fresh data
    const data = await this.fetchDashboardData();

    // Update cache
    this.cache = {
      data,
      cachedAt: new Date(),
    };

    return data;
  }

  /**
   * Check if the current cache is valid based on TTL
   * @returns True if cache exists and has not expired
   */
  private isCacheValid(): boolean {
    if (!this.cache) {
      return false;
    }

    const now = new Date();
    const cacheAge = now.getTime() - this.cache.cachedAt.getTime();
    return cacheAge < this.CACHE_TTL_MS;
  }

  /**
   * Fetch fresh dashboard data from all repositories
   * @returns Aggregated dashboard statistics
   */
  private async fetchDashboardData(): Promise<DashboardData> {
    // Fetch all data in parallel for performance
    const [repositories, workers, workItemCounts, recentCompletions, recentExecutions] =
      await Promise.all([
        this.repositoryRepository.findAll(),
        this.workerRepository.findAll(),
        this.workItemRepository.countByStatus(),
        this.workItemRepository.findRecentByStatus("done", 5),
        this.agentExecutionRepository.findRecent(10),
      ]);

    // Aggregate repository stats by sync status
    const repositoryStats: RepositoryStats = {
      pending: 0,
      syncing: 0,
      synced: 0,
      error: 0,
    };

    repositories.forEach((repo) => {
      repositoryStats[repo.syncStatus]++;
    });

    // Aggregate agent stats by worker status
    const agentStats: AgentStats = {
      idle: 0,
      working: 0,
      paused: 0,
      error: 0,
      terminated: 0,
    };

    workers.forEach((worker) => {
      agentStats[worker.status]++;
    });

    // Work item stats come directly from countByStatus()
    const workItemStats: WorkItemStats = {
      backlog: workItemCounts.backlog,
      ready: workItemCounts.ready,
      in_progress: workItemCounts.in_progress,
      review: workItemCounts.review,
      done: workItemCounts.done,
    };

    return {
      repositories: repositoryStats,
      agents: agentStats,
      workItems: workItemStats,
      recentCompletions,
      recentExecutions,
    };
  }

  /**
   * Clear the cache (useful for testing or forcing refresh)
   */
  clearCache(): void {
    this.cache = null;
  }
}
