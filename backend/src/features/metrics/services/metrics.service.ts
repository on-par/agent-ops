import type { DrizzleDatabase } from "../../../shared/db/index.js";
import { WorkerRepository } from "../../workers/repositories/worker.repository.js";
import { WorkItemRepository } from "../../work-items/repositories/work-item.repository.js";
import { AgentExecutionRepository } from "../../agent-runtime/repositories/agent-execution.repository.js";
import { ObservabilityService } from "../../../shared/observability/observability.service.js";
import type {
  AgentMetricsData,
  AgentMetricsResponse,
  AgentMetricsFilters,
  WorkMetricsData,
  WorkMetricsResponse,
  WorkMetricsFilters,
  SystemMetricsData,
  SystemMetricsResponse,
  TraceData,
  TracesResponse,
  TracesFilters,
  CachedMetrics,
} from "../types/metrics.types.js";
import { eq, gte, lte, and } from "drizzle-orm";
import { traces as tracesTable, workers as workersTable, workItems as workItemsTable, agentExecutions as agentExecutionsTable } from "../../../shared/db/schema.js";

/**
 * Service for aggregating metrics with caching
 * Implements 5-second cache TTL to minimize database queries
 */
export class MetricsService {
  private observabilityService: ObservabilityService;
  private workerRepository: WorkerRepository;
  private workItemRepository: WorkItemRepository;
  private agentExecutionRepository: AgentExecutionRepository;
  private cache: Map<string, CachedMetrics<unknown>> = new Map();
  private readonly CACHE_TTL_MS = 5000; // 5 seconds
  private db: DrizzleDatabase;

  constructor(db: DrizzleDatabase) {
    this.db = db;
    this.observabilityService = new ObservabilityService(db);
    this.workerRepository = new WorkerRepository(db);
    this.workItemRepository = new WorkItemRepository(db);
    this.agentExecutionRepository = new AgentExecutionRepository(db);
  }

  /**
   * Check if cache is valid based on TTL
   */
  private isCacheValid(key: string): boolean {
    const cached = this.cache.get(key);
    if (!cached) {
      return false;
    }

    const now = new Date();
    const age = now.getTime() - cached.cachedAt.getTime();
    return age < this.CACHE_TTL_MS;
  }

  /**
   * Get data from cache
   */
  private getFromCache<T>(key: string): T | null {
    if (this.isCacheValid(key)) {
      return (this.cache.get(key)?.data as T) || null;
    }
    return null;
  }

  /**
   * Set data in cache
   */
  private setCache<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      cachedAt: new Date(),
    });
  }

  /**
   * Get agent/worker metrics with optional filtering
   */
  async getAgentMetrics(filters: AgentMetricsFilters = {}): Promise<AgentMetricsResponse> {
    const cacheKey = `agent-metrics-${JSON.stringify(filters)}`;

    // Check cache
    const cached = this.getFromCache<AgentMetricsResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    // Get all workers
    let workers = await this.workerRepository.findAll();

    // Filter by templateId if provided
    if (filters.templateId) {
      workers = workers.filter((w) => w.templateId === filters.templateId);
    }

    // Filter by status if provided
    if (filters.status) {
      workers = workers.filter((w) => w.status === filters.status);
    }

    // Apply pagination
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    const paginatedWorkers = workers.slice(offset, offset + limit);

    // Map workers to agent metrics data
    const data: AgentMetricsData[] = await Promise.all(
      paginatedWorkers.map(async (worker) => {
        // Get execution history for this worker
        const executions = await this.agentExecutionRepository.findByWorkerId(worker.id);

        // Calculate performance metrics
        const completedExecutions = executions.filter((e) => e.status === "success");
        const avgExecutionTimeMs =
          completedExecutions.length > 0
            ? completedExecutions.reduce((sum, e) => sum + (e.durationMs ?? 0), 0) / completedExecutions.length
            : 0;

        const successRate = executions.length > 0 ? completedExecutions.length / executions.length : 0;

        // Get work items assigned to this worker
        const assignedWorkItems = await this.workItemRepository.findByAssignedAgent(worker.id);
        const activeTasks = assignedWorkItems.filter((w) => w.status === "ready" || w.status === "in_progress").length;
        const pendingTasks = assignedWorkItems.filter((w) => w.status === "backlog").length;

        // Count completed items from today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const completedToday = assignedWorkItems.filter(
          (w) => w.completedAt && new Date(w.completedAt) >= today && w.status === "done"
        ).length;

        // Map worker status
        const statusMap: Record<string, "active" | "idle" | "offline"> = {
          working: "active",
          idle: "idle",
          paused: "idle",
          error: "offline",
          terminated: "offline",
        };

        return {
          workerId: worker.id,
          status: statusMap[worker.status] ?? "idle",
          templateId: worker.templateId,
          currentWorkload: {
            activeTasks,
            pendingTasks,
            completedToday,
          },
          performance: {
            avgExecutionTimeMs,
            successRate,
            totalExecutions: executions.length,
          },
          lastActivity: (worker.spawnedAt instanceof Date ? worker.spawnedAt : new Date()).toISOString(),
        };
      })
    );

    const response: AgentMetricsResponse = {
      data,
      metadata: {
        count: data.length,
        limit,
        offset,
      },
    };

    // Cache the result
    this.setCache(cacheKey, response);

    return response;
  }

  /**
   * Get work item metrics with optional filtering
   */
  async getWorkMetrics(filters: WorkMetricsFilters = {}): Promise<WorkMetricsResponse> {
    const cacheKey = `work-metrics-${JSON.stringify(filters)}`;

    // Check cache
    const cached = this.getFromCache<WorkMetricsResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    // Get all work items
    let workItems = await this.workItemRepository.findAll();

    // Filter by date range if provided
    if (filters.startDate) {
      workItems = workItems.filter((w) => new Date(w.createdAt) >= filters.startDate!);
    }
    if (filters.endDate) {
      workItems = workItems.filter((w) => new Date(w.createdAt) <= filters.endDate!);
    }

    // Filter by type if provided
    if (filters.type) {
      workItems = workItems.filter((w) => w.type === filters.type);
    }

    // Get status counts
    const statusMap: Record<string, string> = {
      backlog: "pending",
      ready: "pending",
      "in_progress": "in_progress",
      review: "in_progress",
      done: "completed",
    };

    const byStatus = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      failed: 0,
    };

    const byType: Record<string, number> = {};
    let totalCompletionTime = 0;
    let completedCount = 0;

    for (const item of workItems) {
      // Count by status
      const mappedStatus = statusMap[item.status] ?? "pending";
      byStatus[mappedStatus as keyof typeof byStatus]++;

      // Count by type
      byType[item.type] = (byType[item.type] ?? 0) + 1;

      // Calculate average completion time
      if (item.completedAt && item.createdAt) {
        const completionTime = new Date(item.completedAt).getTime() - new Date(item.createdAt).getTime();
        totalCompletionTime += completionTime;
        completedCount++;
      }
    }

    const avgCompletionTimeMs = completedCount > 0 ? totalCompletionTime / completedCount : 0;

    const response: WorkMetricsResponse = {
      data: {
        totalCount: workItems.length,
        byStatus,
        byType,
        avgCompletionTimeMs,
      },
      metadata: {
        dateRange:
          filters.startDate || filters.endDate
            ? {
                start: (filters.startDate || new Date(0)).toISOString(),
                end: (filters.endDate || new Date()).toISOString(),
              }
            : { start: new Date(0).toISOString(), end: new Date().toISOString() },
      },
    };

    // Cache the result
    this.setCache(cacheKey, response);

    return response;
  }

  /**
   * Get system-wide metrics
   */
  async getSystemMetrics(): Promise<SystemMetricsResponse> {
    const cacheKey = "system-metrics";

    // Check cache
    const cached = this.getFromCache<SystemMetricsResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    // Get all workers
    const workers = await this.workerRepository.findAll();

    // Count workers by status
    const workerCounts = {
      total: workers.length,
      active: workers.filter((w) => w.status === "working").length,
      idle: workers.filter((w) => w.status === "idle").length,
      offline: workers.filter((w) => w.status === "error" || w.status === "terminated").length,
    };

    // Get work item counts
    const workItems = await this.workItemRepository.findAll();
    const statusMap: Record<string, string> = {
      backlog: "pending",
      ready: "pending",
      "in_progress": "inProgress",
      review: "inProgress",
      done: "completed",
    };

    const workItemCounts = {
      total: workItems.length,
      pending: 0,
      inProgress: 0,
      completed: 0,
      failed: 0,
    };

    for (const item of workItems) {
      const mappedStatus = statusMap[item.status] ?? "pending";
      if (mappedStatus === "inProgress") {
        workItemCounts.inProgress++;
      } else if (mappedStatus === "completed") {
        workItemCounts.completed++;
      } else {
        workItemCounts.pending++;
      }
    }

    // Get trace counts
    const allTraces = await this.db.select().from(tracesTable).execute();
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const traceCounts = {
      totalCount: allTraces.length,
      last24Hours: allTraces.filter((t) => new Date(t.timestamp) >= last24Hours).length,
      errorCount: allTraces.filter((t) => t.eventType === "error").length,
    };

    // Calculate system totals from workers
    const totalTokens = workers.reduce((sum, w) => sum + (w.tokensUsed ?? 0), 0);
    const totalCost = workers.reduce((sum, w) => sum + (w.costUsd ?? 0), 0);
    const totalToolCalls = workers.reduce((sum, w) => sum + (w.toolCalls ?? 0), 0);

    // Get average execution time
    const executions = await this.agentExecutionRepository.findRecent(1000);
    const avgExecutionTimeMs =
      executions.length > 0
        ? executions.reduce((sum, e) => sum + (e.durationMs ?? 0), 0) / executions.length
        : 0;

    const response: SystemMetricsResponse = {
      data: {
        workers: workerCounts,
        workItems: workItemCounts,
        traces: traceCounts,
        system: {
          totalTokens,
          totalCost,
          totalToolCalls,
          avgExecutionTimeMs,
        },
      },
      metadata: {
        timestamp: new Date().toISOString(),
      },
    };

    // Cache the result
    this.setCache(cacheKey, response);

    return response;
  }

  /**
   * Get traces with optional filtering
   */
  async getTraces(filters: TracesFilters = {}): Promise<TracesResponse> {
    const cacheKey = `traces-${JSON.stringify(filters)}`;

    // Check cache
    const cached = this.getFromCache<TracesResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    // Build query conditions
    const conditions = [];

    if (filters.workerId) {
      conditions.push(eq(tracesTable.workerId, filters.workerId));
    }

    if (filters.workItemId) {
      conditions.push(eq(tracesTable.workItemId, filters.workItemId));
    }

    if (filters.eventType) {
      conditions.push(eq(tracesTable.eventType, filters.eventType as any));
    }

    if (filters.startTime) {
      conditions.push(gte(tracesTable.timestamp, filters.startTime as any));
    }

    if (filters.endTime) {
      conditions.push(lte(tracesTable.timestamp, filters.endTime as any));
    }

    // Build query
    let query: any = this.db.select().from(tracesTable);

    if (conditions.length > 0) {
      query = query.where(and(...(conditions as any)));
    }

    // Execute query and apply sorting
    const allTraces = (await query.execute()) as Array<any>;
    const sortedTraces = allTraces.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Apply pagination
    const limit = filters.limit ?? 100;
    const offset = filters.offset ?? 0;
    const paginatedTraces = sortedTraces.slice(offset, offset + limit);

    // Map to TraceData format
    const data: TraceData[] = paginatedTraces.map((trace) => {
      const metadata = typeof trace.data === "string" ? JSON.parse(trace.data) : (trace.data as Record<string, unknown>);
      const result: TraceData = {
        id: trace.id,
        eventType: trace.eventType,
        timestamp: (typeof trace.timestamp === "string" ? trace.timestamp : (trace.timestamp as Date).toISOString()),
        metadata,
      };
      if (trace.workerId) result.workerId = trace.workerId;
      if (trace.workItemId) result.workItemId = trace.workItemId;
      return result;
    });

    const timeRange = filters.startTime || filters.endTime
      ? {
          start: (filters.startTime || new Date(0)).toISOString(),
          end: (filters.endTime || new Date()).toISOString(),
        }
      : { start: new Date(0).toISOString(), end: new Date().toISOString() };

    const response: TracesResponse = {
      data,
      metadata: {
        count: data.length,
        limit,
        offset,
        timeRange,
      },
    };

    // Cache the result
    this.setCache(cacheKey, response);

    return response;
  }

  /**
   * Clear all caches (useful for testing or forcing refresh)
   */
  clearCache(): void {
    this.cache.clear();
  }
}
