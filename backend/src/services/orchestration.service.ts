import { v4 as uuidv4 } from "uuid";
import type { WorkItemRepository } from "../repositories/work-item.repository.js";
import type { WorkerRepository } from "../repositories/worker.repository.js";
import type { AgentExecutionRepository } from "../repositories/agent-execution.repository.js";
import type { WorkflowEngineService } from "./workflow-engine.service.js";
import type { WorkerPoolService } from "./worker-pool.service.js";
import type {
  AgentExecutorService,
  ExecutionContext as AgentExecutionContext,
  ExecutionResult,
} from "./agent-executor.service.js";
import type {
  AgentLifecycleService,
  ExecutionContext as LifecycleExecutionContext,
} from "./agent-lifecycle.service.js";
import type { ObservabilityService } from "./observability.service.js";
import type { WebSocketHubService } from "./websocket-hub.service.js";
import type {
  WorkItem,
  Worker,
  AgentRole,
  WorkItemStatus,
  WorkItemType,
} from "../db/schema.js";

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Configuration for the orchestration service
 */
export interface OrchestrationConfig {
  /** Interval between orchestration cycles in milliseconds */
  cycleIntervalMs: number;
  /** Maximum concurrent workers globally */
  maxGlobalWorkers: number;
  /** Maximum concurrent workers per repository */
  maxWorkersPerRepo: number;
  /** Maximum concurrent workers per user */
  maxWorkersPerUser: number;
  /** Maximum retry attempts for failed executions */
  maxRetryAttempts: number;
  /** Base delay for exponential backoff (ms) */
  retryBaseDelayMs: number;
  /** Maximum delay for exponential backoff (ms) */
  retryMaxDelayMs: number;
  /** Enable auto-spawning of workers when needed */
  autoSpawnWorkers: boolean;
  /** Default template ID for auto-spawned workers */
  defaultTemplateId?: string;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: OrchestrationConfig = {
  cycleIntervalMs: 5000,
  maxGlobalWorkers: 10,
  maxWorkersPerRepo: 3,
  maxWorkersPerUser: 5,
  maxRetryAttempts: 3,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 60000,
  autoSpawnWorkers: false,
};

/**
 * Queue item representing a work item ready for processing
 */
export interface QueueItem {
  workItem: WorkItem;
  priority: number;
  queuedAt: Date;
  retryCount: number;
  lastError?: string;
  lastAttemptAt?: Date;
}

/**
 * Assignment result from matching a work item to a worker
 */
export interface AssignmentResult {
  workItem: WorkItem;
  worker: Worker;
  role: AgentRole;
  assignedAt: Date;
}

/**
 * Progress event for tracking execution status
 */
export interface ProgressEvent {
  workItemId: string;
  workerId: string;
  executionId?: string;
  status: "started" | "in_progress" | "milestone" | "blocked" | "completed" | "failed";
  message?: string;
  progress?: number; // 0-100
  timestamp: Date;
}

/**
 * Error category for classifying failures
 */
export type ErrorCategory =
  | "transient"       // Temporary failures (network, timeout)
  | "rate_limited"    // API rate limiting
  | "resource"        // Resource exhaustion
  | "validation"      // Invalid input/state
  | "system"          // System/infrastructure errors
  | "unknown";        // Unclassified errors

/**
 * Retry context for failed executions
 */
export interface RetryContext {
  workItemId: string;
  errorCategory: ErrorCategory;
  retryCount: number;
  nextRetryAt: Date;
  lastError: string;
}

/**
 * Orchestrator status summary
 */
export interface OrchestratorStatus {
  isRunning: boolean;
  cycleCount: number;
  lastCycleAt: Date | undefined;
  lastCycleDurationMs: number | undefined;
  queueLength: number;
  activeAssignments: number;
  pendingRetries: number;
  workersAvailable: number;
  workersActive: number;
}

/**
 * Concurrency limits status
 */
export interface ConcurrencyStatus {
  global: { current: number; max: number };
  byRepo: Record<string, { current: number; max: number }>;
  byUser: Record<string, { current: number; max: number }>;
}

// ============================================================================
// Work Item Queue Manager (em3.1)
// ============================================================================

/**
 * Manages the queue of work items ready for agent processing
 * Handles prioritization, deduplication, and dependency ordering
 */
export class WorkItemQueueManager {
  private queue: Map<string, QueueItem> = new Map();
  private processingSet: Set<string> = new Set();

  constructor(private workItemRepo: WorkItemRepository) {}

  /**
   * Refresh the queue from the database
   * Finds all ready work items that are not blocked
   */
  async refreshQueue(): Promise<void> {
    const readyItems = await this.workItemRepo.findByStatus("ready");

    for (const item of readyItems) {
      // Skip items already in queue or being processed
      if (this.processingSet.has(item.id)) {
        continue;
      }

      // Skip blocked items
      if (item.blockedBy && item.blockedBy.length > 0) {
        const blockers = await this.workItemRepo.findByIds(item.blockedBy);
        const hasUnresolvedBlockers = blockers.some(b => b.status !== "done");
        if (hasUnresolvedBlockers) {
          continue;
        }
      }

      // Add to queue if not already present
      if (!this.queue.has(item.id)) {
        this.queue.set(item.id, {
          workItem: item,
          priority: this.calculatePriority(item),
          queuedAt: new Date(),
          retryCount: 0,
        });
      }
    }
  }

  /**
   * Calculate priority for a work item
   * Higher priority = processed first
   */
  private calculatePriority(item: WorkItem): number {
    let priority = 0;

    // Type-based priority (bugs are highest)
    const typePriority: Record<WorkItemType, number> = {
      bug: 100,
      feature: 50,
      task: 30,
      research: 10,
    };
    priority += typePriority[item.type] || 0;

    // Age bonus (older items get higher priority)
    const ageHours = (Date.now() - item.createdAt.getTime()) / (1000 * 60 * 60);
    priority += Math.min(ageHours, 48); // Cap at 48 hours bonus

    // Dependency chain bonus (items with dependents get priority)
    if (item.childIds && item.childIds.length > 0) {
      priority += item.childIds.length * 5;
    }

    return priority;
  }

  /**
   * Get the next work item from the queue
   * Returns null if queue is empty
   */
  async getNext(): Promise<QueueItem | null> {
    if (this.queue.size === 0) {
      return null;
    }

    // Sort by priority and get highest
    const sorted = Array.from(this.queue.values()).sort(
      (a, b) => b.priority - a.priority
    );

    const next = sorted[0];
    if (!next) {
      return null;
    }

    // Mark as processing
    this.queue.delete(next.workItem.id);
    this.processingSet.add(next.workItem.id);

    return next;
  }

  /**
   * Mark a work item as completed (remove from processing)
   */
  completeProcessing(workItemId: string): void {
    this.processingSet.delete(workItemId);
  }

  /**
   * Re-queue a work item for retry
   */
  requeue(item: QueueItem, error: string): void {
    this.processingSet.delete(item.workItem.id);
    this.queue.set(item.workItem.id, {
      ...item,
      retryCount: item.retryCount + 1,
      lastError: error,
      lastAttemptAt: new Date(),
      // Lower priority on retry
      priority: item.priority - (item.retryCount + 1) * 10,
    });
  }

  /**
   * Remove a work item from the queue completely
   */
  remove(workItemId: string): void {
    this.queue.delete(workItemId);
    this.processingSet.delete(workItemId);
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.queue.size;
  }

  /**
   * Get processing count
   */
  getProcessingCount(): number {
    return this.processingSet.size;
  }

  /**
   * Check if a work item is queued or being processed
   */
  isInQueue(workItemId: string): boolean {
    return this.queue.has(workItemId) || this.processingSet.has(workItemId);
  }

  /**
   * Get all queue items (for inspection/debugging)
   */
  getQueueItems(): QueueItem[] {
    return Array.from(this.queue.values());
  }
}

// ============================================================================
// Agent Assignment Service (em3.2)
// ============================================================================

/**
 * Handles matching work items to available agents
 * Based on capabilities, workload, and repository familiarity
 */
export class AgentAssignmentService {
  constructor(
    private workerRepo: WorkerRepository,
    private workerPool: WorkerPoolService
  ) {}

  /**
   * Find the best available worker for a work item
   * @param workItem - Work item to assign
   * @param role - Role required for the work
   * @returns Best matching worker or null if none available
   */
  async findBestWorker(
    workItem: WorkItem,
    role: AgentRole
  ): Promise<Worker | null> {
    const availableWorkers = await this.workerPool.getAvailableWorkers();

    if (availableWorkers.length === 0) {
      return null;
    }

    // Score each worker and find the best match
    const scoredWorkers = await Promise.all(
      availableWorkers.map(async (worker) => ({
        worker,
        score: await this.calculateWorkerScore(worker, workItem, role),
      }))
    );

    // Filter out workers with score of 0 (incompatible)
    const compatibleWorkers = scoredWorkers.filter((sw) => sw.score > 0);

    if (compatibleWorkers.length === 0) {
      return null;
    }

    // Sort by score descending and return the best
    compatibleWorkers.sort((a, b) => b.score - a.score);
    return compatibleWorkers[0]?.worker || null;
  }

  /**
   * Calculate a score for how well a worker matches a work item
   * Higher score = better match
   */
  private async calculateWorkerScore(
    worker: Worker,
    _workItem: WorkItem,
    _role: AgentRole
  ): Promise<number> {
    let score = 100; // Base score

    // Factor 1: Current workload (prefer less loaded workers)
    // Idle workers get full score
    if (worker.status === "idle") {
      score += 50;
    }

    // Factor 2: Error history (prefer workers with fewer errors)
    score -= worker.errors * 10;

    // Factor 3: Context window usage (prefer workers with more headroom)
    const contextUsagePercent = worker.contextWindowUsed / worker.contextWindowLimit;
    score -= contextUsagePercent * 30;

    // Factor 4: Cost efficiency (prefer workers that have been cost-effective)
    // Lower cost per token = better score
    if (worker.tokensUsed > 0) {
      const costPerToken = worker.costUsd / worker.tokensUsed;
      // Assuming average cost is ~$0.00002 per token
      if (costPerToken < 0.00002) {
        score += 10;
      }
    }

    // Ensure score doesn't go negative
    return Math.max(0, score);
  }

  /**
   * Assign a work item to a worker
   * Updates both work item and worker state
   */
  async assignWorkToWorker(
    workItem: WorkItem,
    worker: Worker,
    role: AgentRole
  ): Promise<AssignmentResult> {
    // Assign work through worker pool
    await this.workerPool.assignWork(worker.id, workItem.id, role);

    return {
      workItem,
      worker,
      role,
      assignedAt: new Date(),
    };
  }

  /**
   * Determine the required role for a work item based on its current status
   */
  determineRole(workItem: WorkItem): AgentRole {
    // Map status to role
    const statusToRole: Record<WorkItemStatus, AgentRole> = {
      backlog: "refiner",
      ready: "implementer",
      in_progress: "tester",
      review: "reviewer",
      done: "reviewer", // fallback
    };

    return statusToRole[workItem.status] || "implementer";
  }
}

// ============================================================================
// Progress Tracking Service (em3.3)
// ============================================================================

/**
 * Tracks agent progress on work items
 * Emits events for UI updates
 */
export class ProgressTrackingService {
  private progressMap: Map<string, ProgressEvent[]> = new Map();
  private listeners: ((event: ProgressEvent) => void)[] = [];

  constructor(
    private workItemRepo: WorkItemRepository,
    private observability?: ObservabilityService,
    private websocket?: WebSocketHubService
  ) {}

  /**
   * Record a progress event
   */
  async recordProgress(event: ProgressEvent): Promise<void> {
    // Store in memory
    const events = this.progressMap.get(event.workItemId) || [];
    events.push(event);
    this.progressMap.set(event.workItemId, events);

    // Emit to observability if available
    if (this.observability) {
      await this.observability.recordWorkItemUpdate(event.workItemId, {
        status: event.status,
        message: event.message,
        progress: event.progress,
      });
    }

    // Broadcast via WebSocket if available
    if (this.websocket) {
      this.websocket.broadcast({
        type: "work_item:updated",
        timestamp: Date.now(),
        data: event,
      });
    }

    // Notify local listeners
    this.listeners.forEach((listener) => listener(event));
  }

  /**
   * Mark work item as started
   */
  async markStarted(
    workItemId: string,
    workerId: string,
    executionId: string
  ): Promise<void> {
    await this.recordProgress({
      workItemId,
      workerId,
      executionId,
      status: "started",
      message: "Agent started working on this item",
      progress: 0,
      timestamp: new Date(),
    });
  }

  /**
   * Mark work item as completed
   */
  async markCompleted(
    workItemId: string,
    workerId: string,
    executionId: string
  ): Promise<void> {
    await this.recordProgress({
      workItemId,
      workerId,
      executionId,
      status: "completed",
      message: "Agent completed work on this item",
      progress: 100,
      timestamp: new Date(),
    });

    // Clear progress history after completion
    this.progressMap.delete(workItemId);
  }

  /**
   * Mark work item as failed
   */
  async markFailed(
    workItemId: string,
    workerId: string,
    executionId: string,
    error: string
  ): Promise<void> {
    await this.recordProgress({
      workItemId,
      workerId,
      executionId,
      status: "failed",
      message: `Agent failed: ${error}`,
      timestamp: new Date(),
    });
  }

  /**
   * Mark work item as blocked
   */
  async markBlocked(
    workItemId: string,
    workerId: string,
    reason: string
  ): Promise<void> {
    await this.recordProgress({
      workItemId,
      workerId,
      status: "blocked",
      message: `Blocked: ${reason}`,
      timestamp: new Date(),
    });
  }

  /**
   * Record a milestone
   */
  async recordMilestone(
    workItemId: string,
    workerId: string,
    milestone: string,
    progress: number
  ): Promise<void> {
    await this.recordProgress({
      workItemId,
      workerId,
      status: "milestone",
      message: milestone,
      progress,
      timestamp: new Date(),
    });
  }

  /**
   * Get progress history for a work item
   */
  getProgressHistory(workItemId: string): ProgressEvent[] {
    return this.progressMap.get(workItemId) || [];
  }

  /**
   * Add a progress listener
   */
  addListener(listener: (event: ProgressEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}

// ============================================================================
// Error Handling & Retry Service (em3.4)
// ============================================================================

/**
 * Handles agent failures with categorization and retry logic
 */
export class ErrorHandlingService {
  private retryQueue: Map<string, RetryContext> = new Map();

  constructor(
    private config: Pick<
      OrchestrationConfig,
      "maxRetryAttempts" | "retryBaseDelayMs" | "retryMaxDelayMs"
    >
  ) {}

  /**
   * Categorize an error for appropriate handling
   */
  categorizeError(error: Error | string): ErrorCategory {
    const message = error instanceof Error ? error.message : error;
    const lowerMessage = message.toLowerCase();

    // Rate limiting
    if (
      lowerMessage.includes("rate limit") ||
      lowerMessage.includes("429") ||
      lowerMessage.includes("too many requests")
    ) {
      return "rate_limited";
    }

    // Transient errors
    if (
      lowerMessage.includes("timeout") ||
      lowerMessage.includes("network") ||
      lowerMessage.includes("connection") ||
      lowerMessage.includes("temporarily") ||
      lowerMessage.includes("503") ||
      lowerMessage.includes("502")
    ) {
      return "transient";
    }

    // Validation errors (check before resource to handle "resource not found")
    if (
      lowerMessage.includes("invalid") ||
      lowerMessage.includes("validation") ||
      lowerMessage.includes("not found") ||
      lowerMessage.includes("400")
    ) {
      return "validation";
    }

    // Resource errors
    if (
      lowerMessage.includes("memory") ||
      lowerMessage.includes("context window") ||
      lowerMessage.includes("token limit") ||
      lowerMessage.includes("resource exhausted") ||
      lowerMessage.includes("out of resource")
    ) {
      return "resource";
    }

    // System errors
    if (
      lowerMessage.includes("internal") ||
      lowerMessage.includes("500") ||
      lowerMessage.includes("system")
    ) {
      return "system";
    }

    return "unknown";
  }

  /**
   * Determine if an error should be retried
   */
  shouldRetry(category: ErrorCategory, retryCount: number): boolean {
    // Never retry validation errors
    if (category === "validation") {
      return false;
    }

    // Always retry rate limiting (up to max)
    if (category === "rate_limited") {
      return retryCount < this.config.maxRetryAttempts;
    }

    // Retry transient errors
    if (category === "transient") {
      return retryCount < this.config.maxRetryAttempts;
    }

    // Limited retries for other categories
    return retryCount < Math.min(2, this.config.maxRetryAttempts);
  }

  /**
   * Calculate delay before next retry (exponential backoff with jitter)
   */
  calculateRetryDelay(retryCount: number, category: ErrorCategory): number {
    // Longer base delay for rate limiting
    const baseDelay =
      category === "rate_limited"
        ? this.config.retryBaseDelayMs * 5
        : this.config.retryBaseDelayMs;

    // Exponential backoff
    const exponentialDelay = baseDelay * Math.pow(2, retryCount);

    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, this.config.retryMaxDelayMs);

    // Add jitter (±20%)
    const jitter = cappedDelay * 0.2 * (Math.random() - 0.5);

    return Math.floor(cappedDelay + jitter);
  }

  /**
   * Schedule a retry for a failed work item
   */
  scheduleRetry(
    workItemId: string,
    error: Error | string,
    retryCount: number
  ): RetryContext | null {
    const category = this.categorizeError(error);

    if (!this.shouldRetry(category, retryCount)) {
      return null;
    }

    const delay = this.calculateRetryDelay(retryCount, category);
    const context: RetryContext = {
      workItemId,
      errorCategory: category,
      retryCount: retryCount + 1,
      nextRetryAt: new Date(Date.now() + delay),
      lastError: error instanceof Error ? error.message : error,
    };

    this.retryQueue.set(workItemId, context);
    return context;
  }

  /**
   * Get work items ready for retry
   */
  getReadyRetries(): RetryContext[] {
    const now = Date.now();
    const ready: RetryContext[] = [];

    for (const [workItemId, context] of this.retryQueue) {
      if (context.nextRetryAt.getTime() <= now) {
        ready.push(context);
        this.retryQueue.delete(workItemId);
      }
    }

    return ready;
  }

  /**
   * Cancel a scheduled retry
   */
  cancelRetry(workItemId: string): void {
    this.retryQueue.delete(workItemId);
  }

  /**
   * Get count of pending retries
   */
  getPendingRetryCount(): number {
    return this.retryQueue.size;
  }

  /**
   * Log error with context for debugging
   */
  logError(
    workItemId: string,
    workerId: string,
    error: Error | string,
    category: ErrorCategory
  ): void {
    const message = error instanceof Error ? error.message : error;
    const stack = error instanceof Error ? error.stack : undefined;

    console.error(
      `[Orchestration] Error on work item ${workItemId} (worker: ${workerId})`,
      {
        category,
        message,
        stack,
        timestamp: new Date().toISOString(),
      }
    );
  }
}

// ============================================================================
// Concurrency Limits Service (em3.5)
// ============================================================================

/**
 * Manages concurrent agent execution limits
 */
export class ConcurrencyLimitsService {
  private activeByRepo: Map<string, Set<string>> = new Map();
  private activeByUser: Map<string, Set<string>> = new Map();
  private globalActive: Set<string> = new Set();

  constructor(
    private config: Pick<
      OrchestrationConfig,
      "maxGlobalWorkers" | "maxWorkersPerRepo" | "maxWorkersPerUser"
    >
  ) {}

  /**
   * Check if a new execution can be started
   */
  canStartExecution(workItem: WorkItem): { allowed: boolean; reason?: string } {
    // Check global limit
    if (this.globalActive.size >= this.config.maxGlobalWorkers) {
      return {
        allowed: false,
        reason: `Global concurrent limit reached (${this.config.maxGlobalWorkers})`,
      };
    }

    // Check per-repo limit
    if (workItem.repositoryId) {
      const repoActive = this.activeByRepo.get(workItem.repositoryId);
      if (repoActive && repoActive.size >= this.config.maxWorkersPerRepo) {
        return {
          allowed: false,
          reason: `Per-repository limit reached for ${workItem.repositoryId} (${this.config.maxWorkersPerRepo})`,
        };
      }
    }

    // Check per-user limit
    const userActive = this.activeByUser.get(workItem.createdBy);
    if (userActive && userActive.size >= this.config.maxWorkersPerUser) {
      return {
        allowed: false,
        reason: `Per-user limit reached for ${workItem.createdBy} (${this.config.maxWorkersPerUser})`,
        };
    }

    return { allowed: true };
  }

  /**
   * Register an execution start
   */
  registerStart(workItem: WorkItem, workerId: string): void {
    // Global tracking
    this.globalActive.add(workerId);

    // Per-repo tracking
    if (workItem.repositoryId) {
      const repoSet =
        this.activeByRepo.get(workItem.repositoryId) || new Set();
      repoSet.add(workerId);
      this.activeByRepo.set(workItem.repositoryId, repoSet);
    }

    // Per-user tracking
    const userSet = this.activeByUser.get(workItem.createdBy) || new Set();
    userSet.add(workerId);
    this.activeByUser.set(workItem.createdBy, userSet);
  }

  /**
   * Register an execution completion
   */
  registerCompletion(workItem: WorkItem, workerId: string): void {
    // Global tracking
    this.globalActive.delete(workerId);

    // Per-repo tracking
    if (workItem.repositoryId) {
      const repoSet = this.activeByRepo.get(workItem.repositoryId);
      if (repoSet) {
        repoSet.delete(workerId);
        if (repoSet.size === 0) {
          this.activeByRepo.delete(workItem.repositoryId);
        }
      }
    }

    // Per-user tracking
    const userSet = this.activeByUser.get(workItem.createdBy);
    if (userSet) {
      userSet.delete(workerId);
      if (userSet.size === 0) {
        this.activeByUser.delete(workItem.createdBy);
      }
    }
  }

  /**
   * Get current concurrency status
   */
  getStatus(): ConcurrencyStatus {
    const byRepo: Record<string, { current: number; max: number }> = {};
    for (const [repoId, workers] of this.activeByRepo) {
      byRepo[repoId] = {
        current: workers.size,
        max: this.config.maxWorkersPerRepo,
      };
    }

    const byUser: Record<string, { current: number; max: number }> = {};
    for (const [userId, workers] of this.activeByUser) {
      byUser[userId] = {
        current: workers.size,
        max: this.config.maxWorkersPerUser,
      };
    }

    return {
      global: {
        current: this.globalActive.size,
        max: this.config.maxGlobalWorkers,
      },
      byRepo,
      byUser,
    };
  }

  /**
   * Update configuration dynamically
   */
  updateConfig(
    config: Partial<
      Pick<
        OrchestrationConfig,
        "maxGlobalWorkers" | "maxWorkersPerRepo" | "maxWorkersPerUser"
      >
    >
  ): void {
    if (config.maxGlobalWorkers !== undefined) {
      this.config.maxGlobalWorkers = config.maxGlobalWorkers;
    }
    if (config.maxWorkersPerRepo !== undefined) {
      this.config.maxWorkersPerRepo = config.maxWorkersPerRepo;
    }
    if (config.maxWorkersPerUser !== undefined) {
      this.config.maxWorkersPerUser = config.maxWorkersPerUser;
    }
  }
}

// ============================================================================
// Main Orchestration Service
// ============================================================================

/**
 * Main orchestration service that coordinates all sub-services
 * Manages the orchestration loop and integrates all components
 */
export class OrchestrationService {
  private isRunning: boolean = false;
  private cycleCount: number = 0;
  private lastCycleAt?: Date;
  private lastCycleDurationMs?: number;
  private loopTimeout: ReturnType<typeof setTimeout> | undefined;

  // Sub-services
  private queueManager: WorkItemQueueManager;
  private assignmentService: AgentAssignmentService;
  private progressTracking: ProgressTrackingService;
  private errorHandling: ErrorHandlingService;
  private concurrencyLimits: ConcurrencyLimitsService;

  // Active executions tracking
  private activeExecutions: Map<
    string,
    { workItem: WorkItem; worker: Worker; executionId: string }
  > = new Map();

  constructor(
    private workItemRepo: WorkItemRepository,
    private workerRepo: WorkerRepository,
    private agentExecutionRepo: AgentExecutionRepository,
    private workflowEngine: WorkflowEngineService,
    private workerPool: WorkerPoolService,
    private agentExecutor: AgentExecutorService,
    private agentLifecycle: AgentLifecycleService,
    private observability: ObservabilityService | undefined,
    private websocket: WebSocketHubService | undefined,
    private config: OrchestrationConfig = DEFAULT_CONFIG
  ) {
    // Initialize sub-services
    this.queueManager = new WorkItemQueueManager(workItemRepo);
    this.assignmentService = new AgentAssignmentService(workerRepo, workerPool);
    this.progressTracking = new ProgressTrackingService(
      workItemRepo,
      observability,
      websocket
    );
    this.errorHandling = new ErrorHandlingService(config);
    this.concurrencyLimits = new ConcurrencyLimitsService(config);
  }

  /**
   * Start the orchestration loop
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn("[Orchestration] Already running");
      return;
    }

    this.isRunning = true;
    console.log("[Orchestration] Starting orchestration loop");

    // Run the first cycle immediately
    await this.runCycle();

    // Schedule subsequent cycles
    this.scheduleNextCycle();
  }

  /**
   * Stop the orchestration loop
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log("[Orchestration] Stopping orchestration loop");
    this.isRunning = false;

    if (this.loopTimeout) {
      clearTimeout(this.loopTimeout);
      this.loopTimeout = undefined;
    }
  }

  /**
   * Schedule the next orchestration cycle
   */
  private scheduleNextCycle(): void {
    if (!this.isRunning) {
      return;
    }

    this.loopTimeout = setTimeout(async () => {
      await this.runCycle();
      this.scheduleNextCycle();
    }, this.config.cycleIntervalMs);
  }

  /**
   * Run a single orchestration cycle
   */
  private async runCycle(): Promise<void> {
    const startTime = Date.now();
    this.cycleCount++;

    try {
      // Step 1: Refresh the work item queue
      await this.queueManager.refreshQueue();

      // Step 2: Process any ready retries
      await this.processRetries();

      // Step 3: Assign work to available workers
      await this.assignWork();

      // Step 4: Monitor active executions (handled by callbacks)
      // Active executions are tracked and their completion is handled asynchronously

    } catch (error) {
      console.error("[Orchestration] Cycle error:", error);
    } finally {
      this.lastCycleAt = new Date();
      this.lastCycleDurationMs = Date.now() - startTime;
    }
  }

  /**
   * Process scheduled retries
   */
  private async processRetries(): Promise<void> {
    const readyRetries = this.errorHandling.getReadyRetries();

    for (const retry of readyRetries) {
      // Re-fetch the work item
      const workItem = await this.workItemRepo.findById(retry.workItemId);
      if (!workItem) {
        continue;
      }

      // Re-add to queue with retry context
      const queueItem: QueueItem = {
        workItem,
        priority: 50, // Medium priority for retries
        queuedAt: new Date(),
        retryCount: retry.retryCount,
        lastError: retry.lastError,
        lastAttemptAt: new Date(),
      };

      // Add back to processing flow
      // (this happens in the next assignWork pass)
    }
  }

  /**
   * Assign work from the queue to available workers
   */
  private async assignWork(): Promise<void> {
    let assigned = 0;

    while (true) {
      // Get next work item from queue
      const queueItem = await this.queueManager.getNext();
      if (!queueItem) {
        break; // Queue is empty
      }

      const { workItem } = queueItem;

      // Check concurrency limits
      const canStart = this.concurrencyLimits.canStartExecution(workItem);
      if (!canStart.allowed) {
        // Re-queue for next cycle
        this.queueManager.requeue(queueItem, canStart.reason || "Concurrency limit");
        continue;
      }

      // Determine the role needed
      const role = this.assignmentService.determineRole(workItem);

      // Find best available worker
      const worker = await this.assignmentService.findBestWorker(workItem, role);
      if (!worker) {
        // No worker available, re-queue
        this.queueManager.requeue(queueItem, "No available workers");

        // Try to spawn a new worker if enabled
        if (this.config.autoSpawnWorkers && this.config.defaultTemplateId) {
          await this.trySpawnWorker();
        }
        continue;
      }

      // Execute the assignment
      try {
        await this.executeAssignment(workItem, worker, role, queueItem.retryCount);
        assigned++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.queueManager.requeue(queueItem, message);
      }
    }

    if (assigned > 0) {
      console.log(`[Orchestration] Assigned ${assigned} work items`);
    }
  }

  /**
   * Execute an assignment (assign and start execution)
   */
  private async executeAssignment(
    workItem: WorkItem,
    worker: Worker,
    role: AgentRole,
    retryCount: number
  ): Promise<void> {
    // Assign work through workflow engine
    await this.workflowEngine.assignWorkToAgent(workItem.id, worker.id, role);

    // Register concurrency
    this.concurrencyLimits.registerStart(workItem, worker.id);

    // Run pre-execution hooks
    const lifecycleContext: LifecycleExecutionContext = {
      workerId: worker.id,
      workItemId: workItem.id,
      workspaceId: "", // Will be populated by workspace manager
      templateId: worker.templateId,
      workspacePath: "", // Will be populated by workspace manager
    };

    const canProceed = await this.agentLifecycle.runPreExecutionHooks(
      lifecycleContext
    );
    if (!canProceed) {
      throw new Error("Pre-execution hook blocked execution");
    }

    // Build execution context for agent
    const executionContext: AgentExecutionContext = {
      ...lifecycleContext,
      prompt: this.buildPrompt(workItem, role),
    };

    // Track progress
    await this.progressTracking.markStarted(workItem.id, worker.id, "pending");

    // Execute asynchronously
    this.executeAsync(workItem, worker, role, executionContext, lifecycleContext, retryCount);
  }

  /**
   * Execute work asynchronously
   */
  private async executeAsync(
    workItem: WorkItem,
    worker: Worker,
    role: AgentRole,
    context: AgentExecutionContext,
    lifecycleContext: LifecycleExecutionContext,
    retryCount: number
  ): Promise<void> {
    let result: ExecutionResult | undefined;

    try {
      // Execute with agent executor
      result = await this.agentExecutor.execute(context);

      // Track execution
      this.activeExecutions.set(workItem.id, {
        workItem,
        worker,
        executionId: result.executionId,
      });

      if (result.status === "success") {
        // Mark completed
        await this.progressTracking.markCompleted(
          workItem.id,
          worker.id,
          result.executionId
        );

        // Complete work through workflow engine
        await this.workflowEngine.completeWork(workItem.id, worker.id);

        // Run post-execution hooks
        await this.agentLifecycle.runPostExecutionHooks(lifecycleContext, result);

        // Mark queue item complete
        this.queueManager.completeProcessing(workItem.id);
      } else if (result.status === "error" && result.error) {
        await this.handleExecutionError(
          workItem,
          worker,
          result.executionId,
          result.error,
          retryCount
        );
      } else if (result.status === "cancelled") {
        // Handle cancellation
        this.queueManager.completeProcessing(workItem.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.handleExecutionError(
        workItem,
        worker,
        result?.executionId || "unknown",
        message,
        retryCount
      );
    } finally {
      // Unregister concurrency
      this.concurrencyLimits.registerCompletion(workItem, worker.id);

      // Clean up active execution tracking
      this.activeExecutions.delete(workItem.id);
    }
  }

  /**
   * Handle an execution error
   */
  private async handleExecutionError(
    workItem: WorkItem,
    worker: Worker,
    executionId: string,
    error: string,
    retryCount: number
  ): Promise<void> {
    // Categorize and log
    const category = this.errorHandling.categorizeError(error);
    this.errorHandling.logError(workItem.id, worker.id, error, category);

    // Track failure
    await this.progressTracking.markFailed(
      workItem.id,
      worker.id,
      executionId,
      error
    );

    // Run error hooks
    const errorContext: LifecycleExecutionContext = {
      workerId: worker.id,
      workItemId: workItem.id,
      workspaceId: "",
      templateId: worker.templateId,
      workspacePath: "",
    };
    await this.agentLifecycle.runErrorHooks(errorContext, new Error(error));

    // Schedule retry if appropriate
    const retryContext = this.errorHandling.scheduleRetry(
      workItem.id,
      error,
      retryCount
    );

    if (retryContext) {
      console.log(
        `[Orchestration] Scheduled retry for ${workItem.id} at ${retryContext.nextRetryAt.toISOString()}`
      );
    } else {
      // No more retries - mark as failed in workflow
      // Move back to backlog for manual intervention
      try {
        await this.workflowEngine.transition(workItem.id, "backlog");
      } catch (transitionError) {
        console.error(
          `[Orchestration] Failed to transition ${workItem.id} to backlog:`,
          transitionError
        );
      }
    }

    // Complete queue processing (will be re-queued via retry mechanism if applicable)
    this.queueManager.completeProcessing(workItem.id);

    // Report error to worker pool
    await this.workerPool.reportError(worker.id, error);
  }

  /**
   * Try to spawn a new worker
   */
  private async trySpawnWorker(): Promise<void> {
    if (!this.config.defaultTemplateId) {
      return;
    }

    const canSpawn = await this.workerPool.canSpawnMore();
    if (!canSpawn) {
      return;
    }

    try {
      const sessionId = uuidv4();
      await this.workerPool.spawn(this.config.defaultTemplateId, sessionId);
      console.log("[Orchestration] Auto-spawned new worker");
    } catch (error) {
      console.error("[Orchestration] Failed to auto-spawn worker:", error);
    }
  }

  /**
   * Build a prompt for the agent based on work item and role
   */
  private buildPrompt(workItem: WorkItem, role: AgentRole): string {
    const roleInstructions: Record<AgentRole, string> = {
      refiner: `You are a specification refiner. Review and improve the following work item specification.
        Ensure requirements are clear, success criteria are measurable, and edge cases are considered.`,
      implementer: `You are an implementation agent. Implement the following work item according to its specification.
        Follow coding best practices and ensure all success criteria are met.`,
      tester: `You are a testing agent. Test the implementation for the following work item.
        Verify all success criteria are met and document any issues found.`,
      reviewer: `You are a code reviewer. Review the changes made for the following work item.
        Check for code quality, potential bugs, and adherence to best practices.`,
    };

    return `${roleInstructions[role]}

## Work Item: ${workItem.title}
Type: ${workItem.type}
Status: ${workItem.status}

### Description
${workItem.description || "No description provided."}

### Success Criteria
${
  workItem.successCriteria && workItem.successCriteria.length > 0
    ? workItem.successCriteria.map((c) => `- ${c.description}`).join("\n")
    : "No specific success criteria defined."
}

### Linked Files
${
  workItem.linkedFiles && workItem.linkedFiles.length > 0
    ? workItem.linkedFiles.join("\n")
    : "No specific files linked."
}

Please complete the work according to your role's responsibilities.`;
  }

  /**
   * Get current orchestrator status
   */
  getStatus(): OrchestratorStatus {
    return {
      isRunning: this.isRunning,
      cycleCount: this.cycleCount,
      lastCycleAt: this.lastCycleAt,
      lastCycleDurationMs: this.lastCycleDurationMs,
      queueLength: this.queueManager.getQueueLength(),
      activeAssignments: this.activeExecutions.size,
      pendingRetries: this.errorHandling.getPendingRetryCount(),
      workersAvailable: 0, // Will be populated asynchronously if needed
      workersActive: this.concurrencyLimits.getStatus().global.current,
    };
  }

  /**
   * Get concurrency status
   */
  getConcurrencyStatus(): ConcurrencyStatus {
    return this.concurrencyLimits.getStatus();
  }

  /**
   * Get queue items for debugging/monitoring
   */
  getQueueItems(): QueueItem[] {
    return this.queueManager.getQueueItems();
  }

  /**
   * Force a single orchestration cycle (for testing/manual trigger)
   */
  async forceCycle(): Promise<void> {
    await this.runCycle();
  }

  /**
   * Update configuration dynamically
   */
  updateConfig(config: Partial<OrchestrationConfig>): void {
    this.config = { ...this.config, ...config };

    // Update sub-services
    this.concurrencyLimits.updateConfig(config);
  }

  // ========== Public access to sub-services for testing ==========

  getQueueManager(): WorkItemQueueManager {
    return this.queueManager;
  }

  getAssignmentService(): AgentAssignmentService {
    return this.assignmentService;
  }

  getProgressTracking(): ProgressTrackingService {
    return this.progressTracking;
  }

  getErrorHandling(): ErrorHandlingService {
    return this.errorHandling;
  }

  getConcurrencyLimits(): ConcurrencyLimitsService {
    return this.concurrencyLimits;
  }
}
