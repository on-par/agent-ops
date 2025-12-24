import { WorkerRepository } from "../repositories/worker.repository.js";
import type { AgentRole, Worker } from "../../../shared/db/schema.js";

/**
 * Configuration for the Worker Pool
 */
export interface WorkerPoolConfig {
  maxWorkers: number;
}

/**
 * Metric update data for worker performance tracking
 */
export interface MetricUpdate {
  tokensUsed?: number;
  costUsd?: number;
  toolCalls?: number;
  contextWindowUsed?: number;
}

/**
 * Worker pool summary with aggregate metrics
 */
export interface WorkerPoolSummary {
  workers: Worker[];
  totalWorkers: number;
  activeWorkers: number;
  idleWorkers: number;
  totalCostUsd: number;
  totalTokensUsed: number;
  totalToolCalls: number;
}

/**
 * Worker Pool Service
 *
 * Manages the lifecycle of agent workers including spawning, termination,
 * work assignment, and metrics tracking. Enforces concurrency limits and
 * provides pool-level aggregations and queries.
 */
export class WorkerPoolService {
  private maxWorkers: number;

  constructor(
    private readonly workerRepository: WorkerRepository,
    config?: WorkerPoolConfig
  ) {
    this.maxWorkers = config?.maxWorkers ?? 10;
  }

  /**
   * Spawn a new worker from a template
   *
   * @param templateId - The template ID to spawn from
   * @param sessionId - The SDK session ID for this worker
   * @returns The newly created worker
   * @throws Error if max workers limit reached or creation fails
   */
  async spawn(templateId: string, sessionId: string): Promise<Worker> {
    // Check concurrency limits
    if (!(await this.canSpawnMore())) {
      const activeCount = await this._countActiveWorkers();
      throw new Error(
        `Cannot spawn worker: maximum worker limit reached (${activeCount}/${this.maxWorkers})`
      );
    }

    // Validate inputs
    if (!templateId || !sessionId) {
      throw new Error("Template ID and session ID are required");
    }

    // Create worker with idle status
    const workerId = crypto.randomUUID();
    const worker = await this.workerRepository.create({
      id: workerId,
      templateId,
      sessionId,
      status: "idle",
      spawnedAt: new Date(),
      currentWorkItemId: null,
      currentRole: null,
      contextWindowUsed: 0,
      contextWindowLimit: 200000,
      tokensUsed: 0,
      costUsd: 0,
      toolCalls: 0,
      errors: 0,
    });

    return worker;
  }

  /**
   * Terminate a worker gracefully
   * Sets status to "terminated" and clears current work assignment
   *
   * @param workerId - The worker ID to terminate
   * @returns The terminated worker
   * @throws Error if worker not found
   */
  async terminate(workerId: string): Promise<Worker> {
    const worker = await this.workerRepository.findById(workerId);
    if (!worker) {
      throw new Error(`Worker with id ${workerId} not found`);
    }

    // Update status and clear work assignment
    return await this.workerRepository.update(workerId, {
      status: "terminated",
      currentWorkItemId: null,
      currentRole: null,
    });
  }

  /**
   * Pause a working agent
   * Can only pause workers in "working" status
   *
   * @param workerId - The worker ID to pause
   * @returns The paused worker
   * @throws Error if worker not found or not in working status
   */
  async pause(workerId: string): Promise<Worker> {
    const worker = await this.workerRepository.findById(workerId);
    if (!worker) {
      throw new Error(`Worker with id ${workerId} not found`);
    }

    if (worker.status !== "working") {
      throw new Error(
        `Cannot pause worker ${workerId}: worker is not in working status (current: ${worker.status})`
      );
    }

    return await this.workerRepository.update(workerId, {
      status: "paused",
    });
  }

  /**
   * Resume a paused agent
   * Can only resume workers in "paused" status
   *
   * @param workerId - The worker ID to resume
   * @returns The resumed worker
   * @throws Error if worker not found or not in paused status
   */
  async resume(workerId: string): Promise<Worker> {
    const worker = await this.workerRepository.findById(workerId);
    if (!worker) {
      throw new Error(`Worker with id ${workerId} not found`);
    }

    if (worker.status !== "paused") {
      throw new Error(
        `Cannot resume worker ${workerId}: worker is not in paused status (current: ${worker.status})`
      );
    }

    // Resume to working status if there's current work, otherwise idle
    const newStatus = worker.currentWorkItemId ? "working" : "idle";

    return await this.workerRepository.update(workerId, {
      status: newStatus,
    });
  }

  /**
   * Assign work to a worker
   * Worker must be in "idle" status to accept new work
   *
   * @param workerId - The worker ID to assign work to
   * @param workItemId - The work item ID to assign
   * @param role - The agent role for this work assignment
   * @returns The updated worker
   * @throws Error if worker not found or not idle
   */
  async assignWork(
    workerId: string,
    workItemId: string,
    role: AgentRole
  ): Promise<Worker> {
    const worker = await this.workerRepository.findById(workerId);
    if (!worker) {
      throw new Error(`Worker with id ${workerId} not found`);
    }

    if (worker.status !== "idle") {
      throw new Error(
        `Cannot assign work to worker ${workerId}: worker is not idle (current: ${worker.status})`
      );
    }

    return await this.workerRepository.update(workerId, {
      currentWorkItemId: workItemId,
      currentRole: role,
      status: "working",
    });
  }

  /**
   * Mark current work as complete
   * Clears work assignment and sets worker to idle status
   *
   * @param workerId - The worker ID that completed work
   * @returns The updated worker
   * @throws Error if worker not found
   */
  async completeWork(workerId: string): Promise<Worker> {
    const worker = await this.workerRepository.findById(workerId);
    if (!worker) {
      throw new Error(`Worker with id ${workerId} not found`);
    }

    return await this.workerRepository.update(workerId, {
      currentWorkItemId: null,
      currentRole: null,
      status: "idle",
    });
  }

  /**
   * Get pool summary with aggregate metrics
   *
   * @returns Pool summary including counts and aggregate metrics
   */
  async getPool(): Promise<WorkerPoolSummary> {
    const allWorkers = await this.workerRepository.findAll();

    // Calculate counts
    const totalWorkers = allWorkers.length;
    const activeWorkers = allWorkers.filter(
      (w) => w.status === "working" || w.status === "idle"
    ).length;
    const idleWorkers = allWorkers.filter((w) => w.status === "idle").length;

    // Calculate aggregate metrics
    const totalCostUsd = allWorkers.reduce((sum, w) => sum + w.costUsd, 0);
    const totalTokensUsed = allWorkers.reduce((sum, w) => sum + w.tokensUsed, 0);
    const totalToolCalls = allWorkers.reduce((sum, w) => sum + w.toolCalls, 0);

    return {
      workers: allWorkers,
      totalWorkers,
      activeWorkers,
      idleWorkers,
      totalCostUsd,
      totalTokensUsed,
      totalToolCalls,
    };
  }

  /**
   * Get idle workers available for work assignment
   *
   * @returns Array of idle workers
   */
  async getAvailableWorkers(): Promise<Worker[]> {
    return await this.workerRepository.findByStatus("idle");
  }

  /**
   * Get workers for a specific template
   *
   * @param templateId - The template ID to filter by
   * @returns Array of workers using the specified template
   */
  async getWorkersByTemplate(templateId: string): Promise<Worker[]> {
    return await this.workerRepository.findByTemplate(templateId);
  }

  /**
   * Update worker metrics
   * Increments the specified metrics by the provided values
   *
   * @param workerId - The worker ID to update metrics for
   * @param metrics - Metric updates to apply
   * @returns The updated worker
   * @throws Error if worker not found
   */
  async updateMetrics(
    workerId: string,
    metrics: MetricUpdate
  ): Promise<Worker> {
    // Validate worker exists
    const worker = await this.workerRepository.findById(workerId);
    if (!worker) {
      throw new Error(`Worker with id ${workerId} not found`);
    }

    // Update metrics using repository's updateMetrics method for incremental updates
    const incrementalMetrics: {
      tokensUsed?: number;
      costUsd?: number;
      toolCalls?: number;
    } = {};

    if (metrics.tokensUsed !== undefined) {
      incrementalMetrics.tokensUsed = metrics.tokensUsed;
    }
    if (metrics.costUsd !== undefined) {
      incrementalMetrics.costUsd = metrics.costUsd;
    }
    if (metrics.toolCalls !== undefined) {
      incrementalMetrics.toolCalls = metrics.toolCalls;
    }

    // Update incremental metrics
    let updatedWorker = worker;
    if (Object.keys(incrementalMetrics).length > 0) {
      updatedWorker = await this.workerRepository.updateMetrics(
        workerId,
        incrementalMetrics
      );
    }

    // Update context window usage directly if provided
    if (metrics.contextWindowUsed !== undefined) {
      updatedWorker = await this.workerRepository.update(workerId, {
        contextWindowUsed: metrics.contextWindowUsed,
      });
    }

    return updatedWorker;
  }

  /**
   * Set maximum workers limit
   * Controls how many workers can be spawned concurrently
   *
   * @param limit - New maximum workers limit (must be positive)
   * @throws Error if limit is not positive
   */
  setMaxWorkers(limit: number): void {
    if (limit <= 0) {
      throw new Error("Maximum workers limit must be positive");
    }
    this.maxWorkers = limit;
  }

  /**
   * Check if more workers can be spawned
   * Compares current active worker count against max workers limit
   *
   * @returns True if more workers can be spawned, false otherwise
   */
  async canSpawnMore(): Promise<boolean> {
    const activeCount = await this._countActiveWorkers();
    return activeCount < this.maxWorkers;
  }

  /**
   * Report an error for a worker
   * Increments error count and updates worker status to "error"
   *
   * @param workerId - The worker ID that encountered an error
   * @param error - Error message or description
   * @returns The updated worker
   * @throws Error if worker not found
   */
  async reportError(workerId: string, _error: string): Promise<Worker> {
    const worker = await this.workerRepository.findById(workerId);
    if (!worker) {
      throw new Error(`Worker with id ${workerId} not found`);
    }

    // Update status to error and increment error count
    return await this.workerRepository.update(workerId, {
      status: "error",
      errors: worker.errors + 1,
    });
  }

  /**
   * Get current max workers configuration
   *
   * @returns Current max workers limit
   */
  getMaxWorkers(): number {
    return this.maxWorkers;
  }

  /**
   * Private helper to count active workers (idle + working)
   *
   * @returns Count of active workers
   */
  private async _countActiveWorkers(): Promise<number> {
    const activeWorkers = await this.workerRepository.findActive();
    return activeWorkers.length;
  }
}
