import { v4 as uuidv4 } from "uuid";
import type { WorkItemRepository } from "../../work-items/repositories/work-item.repository.js";
import type { WorkerRepository } from "../../workers/repositories/worker.repository.js";
import type { AgentExecutionRepository } from "../../agent-runtime/repositories/agent-execution.repository.js";
import type { TemplateRepository } from "../../templates/repositories/template.repository.js";
import type { WorkflowEngineService } from "./workflow-engine.service.js";
import type { WorkerPoolService } from "../../workers/services/worker-pool.service.js";
import type {
  AgentExecutorService,
  ExecutionContext as AgentExecutionContext,
  ExecutionResult,
} from "../../agent-runtime/services/agent-executor.service.js";
import type {
  AgentLifecycleService,
  ExecutionContext as LifecycleExecutionContext,
} from "../../agent-runtime/services/agent-lifecycle.service.js";
import type { ObservabilityService } from "../../../shared/observability/observability.service.js";
import type { WebSocketHubService } from "../../../shared/websocket/websocket-hub.service.js";
import type {
  WorkItem,
  Worker,
  Template,
  AgentRole,
  WorkItemStatus,
  WorkItemType,
} from '../../../shared/db/schema.js';

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
 * Repository familiarity entry tracking worker experience with a repo
 */
export interface RepoFamiliarityEntry {
  workerId: string;
  repositoryId: string;
  completedTasks: number;
  lastWorkedAt: Date;
}

/**
 * Scoring weights for agent assignment
 */
export interface AssignmentScoringWeights {
  /** Weight for workload factor (0-1) */
  workload: number;
  /** Weight for error history factor (0-1) */
  errorHistory: number;
  /** Weight for context headroom factor (0-1) */
  contextHeadroom: number;
  /** Weight for cost efficiency factor (0-1) */
  costEfficiency: number;
  /** Weight for capability match factor (0-1) */
  capabilityMatch: number;
  /** Weight for role match factor (0-1) */
  roleMatch: number;
  /** Weight for repo familiarity factor (0-1) */
  repoFamiliarity: number;
}

/**
 * Default scoring weights
 */
const DEFAULT_SCORING_WEIGHTS: AssignmentScoringWeights = {
  workload: 1.0,
  errorHistory: 1.0,
  contextHeadroom: 0.5,
  costEfficiency: 0.3,
  capabilityMatch: 1.0,
  roleMatch: 0.8,
  repoFamiliarity: 0.7,
};

/**
 * Handles matching work items to available agents
 * Based on capabilities, workload, and repository familiarity
 */
export class AgentAssignmentService {
  /** Cache of templates by ID for performance */
  private templateCache: Map<string, Template> = new Map();

  /** Tracks worker familiarity with repositories */
  private repoFamiliarity: Map<string, RepoFamiliarityEntry> = new Map();

  /** Scoring weights for assignment decisions */
  private scoringWeights: AssignmentScoringWeights;

  constructor(
    private workerRepo: WorkerRepository,
    private workerPool: WorkerPoolService,
    private templateRepo?: TemplateRepository,
    scoringWeights?: Partial<AssignmentScoringWeights>
  ) {
    this.scoringWeights = { ...DEFAULT_SCORING_WEIGHTS, ...scoringWeights };
  }

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
   *
   * Scoring factors:
   * 1. Workload: Idle workers preferred
   * 2. Error history: Fewer errors preferred
   * 3. Context headroom: More headroom preferred
   * 4. Cost efficiency: Lower cost per token preferred
   * 5. Capability match: Template must support work item type
   * 6. Role match: Template default role matching preferred
   * 7. Repo familiarity: Experience with repo preferred
   */
  private async calculateWorkerScore(
    worker: Worker,
    workItem: WorkItem,
    role: AgentRole
  ): Promise<number> {
    let score = 100; // Base score
    const weights = this.scoringWeights;

    // Get template for capability checks
    const template = await this.getTemplate(worker.templateId);

    // Factor 1: Capability match (REQUIRED - return 0 if incompatible)
    if (template) {
      const capabilityScore = this.calculateCapabilityScore(template, workItem);
      if (capabilityScore === 0) {
        return 0; // Worker cannot handle this work item type
      }
      score += capabilityScore * weights.capabilityMatch;
    }

    // Factor 2: Role match (preferred but not required)
    if (template) {
      const roleScore = this.calculateRoleScore(template, role);
      score += roleScore * weights.roleMatch;
    }

    // Factor 3: Current workload (prefer idle workers)
    if (worker.status === "idle") {
      score += 50 * weights.workload;
    }

    // Factor 4: Error history (prefer workers with fewer errors)
    score -= worker.errors * 10 * weights.errorHistory;

    // Factor 5: Context window usage (prefer workers with more headroom)
    const contextUsagePercent = worker.contextWindowUsed / worker.contextWindowLimit;
    score -= contextUsagePercent * 30 * weights.contextHeadroom;

    // Factor 6: Cost efficiency (prefer workers that have been cost-effective)
    if (worker.tokensUsed > 0) {
      const costPerToken = worker.costUsd / worker.tokensUsed;
      // Assuming average cost is ~$0.00002 per token
      if (costPerToken < 0.00002) {
        score += 10 * weights.costEfficiency;
      }
    }

    // Factor 7: Repository familiarity (prefer workers that know the repo)
    if (workItem.repositoryId) {
      const familiarityScore = this.calculateRepoFamiliarityScore(
        worker.id,
        workItem.repositoryId
      );
      score += familiarityScore * weights.repoFamiliarity;
    }

    // Ensure score doesn't go negative
    return Math.max(0, score);
  }

  /**
   * Calculate capability score based on template's allowed work item types
   * @returns 0 if incompatible, 30 if compatible
   */
  private calculateCapabilityScore(
    template: Template,
    workItem: WorkItem
  ): number {
    const allowedTypes = template.allowedWorkItemTypes;

    // Wildcard means all types are allowed
    if (allowedTypes.includes("*")) {
      return 30;
    }

    // Check if work item type is in allowed list
    if (allowedTypes.includes(workItem.type)) {
      return 30;
    }

    // Incompatible
    return 0;
  }

  /**
   * Calculate role score based on template's default role
   * @returns 0-25 based on role match
   */
  private calculateRoleScore(template: Template, requiredRole: AgentRole): number {
    // No default role means agent is generic (good for any role)
    if (!template.defaultRole) {
      return 15;
    }

    // Perfect match
    if (template.defaultRole === requiredRole) {
      return 25;
    }

    // No match but can still work (just not specialized)
    return 5;
  }

  /**
   * Calculate repository familiarity score
   * @returns 0-40 based on familiarity level
   */
  private calculateRepoFamiliarityScore(
    workerId: string,
    repositoryId: string
  ): number {
    const key = `${workerId}:${repositoryId}`;
    const entry = this.repoFamiliarity.get(key);

    if (!entry) {
      return 0; // No prior experience
    }

    // Score based on completed tasks (capped at 5 for max bonus)
    const taskBonus = Math.min(entry.completedTasks, 5) * 5; // Max 25 points

    // Recency bonus (tasks in last 24 hours get extra points)
    const hoursSinceLastWork =
      (Date.now() - entry.lastWorkedAt.getTime()) / (1000 * 60 * 60);
    const recencyBonus = hoursSinceLastWork < 24 ? 15 : hoursSinceLastWork < 72 ? 10 : 5;

    return taskBonus + recencyBonus; // Max 40 points
  }

  /**
   * Get template by ID (with caching)
   */
  private async getTemplate(templateId: string): Promise<Template | null> {
    // Check cache first
    if (this.templateCache.has(templateId)) {
      return this.templateCache.get(templateId) || null;
    }

    // Fetch from repository if available
    if (this.templateRepo) {
      const template = await this.templateRepo.findById(templateId);
      if (template) {
        this.templateCache.set(templateId, template);
      }
      return template;
    }

    return null;
  }

  /**
   * Record that a worker completed work on a repository
   * Updates familiarity tracking for future assignment decisions
   */
  recordRepoExperience(workerId: string, repositoryId: string): void {
    const key = `${workerId}:${repositoryId}`;
    const existing = this.repoFamiliarity.get(key);

    if (existing) {
      existing.completedTasks += 1;
      existing.lastWorkedAt = new Date();
    } else {
      this.repoFamiliarity.set(key, {
        workerId,
        repositoryId,
        completedTasks: 1,
        lastWorkedAt: new Date(),
      });
    }
  }

  /**
   * Get repository familiarity for a worker
   */
  getRepoFamiliarity(workerId: string): RepoFamiliarityEntry[] {
    const entries: RepoFamiliarityEntry[] = [];
    for (const [key, entry] of this.repoFamiliarity) {
      if (key.startsWith(`${workerId}:`)) {
        entries.push(entry);
      }
    }
    return entries;
  }

  /**
   * Clear template cache (useful after template updates)
   */
  clearTemplateCache(): void {
    this.templateCache.clear();
  }

  /**
   * Update scoring weights dynamically
   */
  updateScoringWeights(weights: Partial<AssignmentScoringWeights>): void {
    this.scoringWeights = { ...this.scoringWeights, ...weights };
  }

  /**
   * Get current scoring weights
   */
  getScoringWeights(): AssignmentScoringWeights {
    return { ...this.scoringWeights };
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
 * Updates WorkItem status and emits events for UI
 *
 * Progress Status Flow:
 * - started: Agent has begun working on the item
 * - in_progress: Agent is actively working, with periodic progress updates
 * - milestone: Agent has reached a significant milestone
 * - blocked: Agent is blocked and cannot proceed
 * - completed: Agent has successfully completed the work
 * - failed: Agent encountered an error and could not complete
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
   * Record a progress event and update WorkItem
   */
  async recordProgress(event: ProgressEvent): Promise<void> {
    // Store in memory for history tracking
    const events = this.progressMap.get(event.workItemId) || [];
    events.push(event);
    this.progressMap.set(event.workItemId, events);

    // Update WorkItem in database based on progress status
    await this.updateWorkItemFromProgress(event);

    // Emit to observability service for tracing
    if (this.observability) {
      await this.observability.recordWorkItemUpdate(event.workItemId, {
        status: event.status,
        message: event.message,
        progress: event.progress,
      });
    }

    // Broadcast progress via WebSocket using dedicated progress event
    if (this.websocket) {
      const progressData: {
        status: ProgressEvent["status"];
        message?: string;
        progress?: number;
        executionId?: string;
      } = { status: event.status };

      if (event.message !== undefined) progressData.message = event.message;
      if (event.progress !== undefined) progressData.progress = event.progress;
      if (event.executionId !== undefined) progressData.executionId = event.executionId;

      this.websocket.notifyWorkItemProgress(
        event.workItemId,
        event.workerId,
        progressData
      );
    }

    // Notify local listeners
    this.listeners.forEach((listener) => listener(event));
  }

  /**
   * Update WorkItem status based on progress event
   * Maps progress status to WorkItem workflow status where appropriate
   */
  private async updateWorkItemFromProgress(event: ProgressEvent): Promise<void> {
    try {
      const updates: Partial<WorkItem> = {
        updatedAt: event.timestamp,
      };

      switch (event.status) {
        case "started":
          // Mark as in_progress when work starts
          updates.status = "in_progress";
          updates.startedAt = event.timestamp;
          break;

        case "completed":
          // Mark as review when completed (workflow transition)
          updates.status = "review";
          updates.completedAt = event.timestamp;
          break;

        case "failed":
          // Keep status as in_progress, the error handling service
          // will transition to backlog if no more retries
          break;

        case "blocked":
          // Keep status as in_progress but log the blocked state
          // This is tracked via observability, not workflow status
          break;

        case "in_progress":
        case "milestone":
          // These are progress updates, don't change workflow status
          // Just update the timestamp
          break;
      }

      // Only update if there are actual changes
      if (Object.keys(updates).length > 1) {
        await this.workItemRepo.update(event.workItemId, updates);
      }
    } catch (error) {
      // Log but don't throw - progress tracking shouldn't fail the execution
      console.error(
        `[ProgressTracking] Failed to update WorkItem ${event.workItemId}:`,
        error
      );
    }
  }

  /**
   * Mark work item as started
   * Updates WorkItem status to in_progress
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
   * Update progress during execution
   * Use this for periodic progress updates while work is ongoing
   */
  async updateProgress(
    workItemId: string,
    workerId: string,
    progress: number,
    message?: string
  ): Promise<void> {
    await this.recordProgress({
      workItemId,
      workerId,
      status: "in_progress",
      message: message || `Progress: ${progress}%`,
      progress: Math.min(99, Math.max(0, progress)), // Clamp to 0-99, 100 is reserved for completed
      timestamp: new Date(),
    });
  }

  /**
   * Mark work item as completed
   * Updates WorkItem status to review
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
   * Keeps WorkItem in in_progress status for retry handling
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
   * Agent cannot proceed due to external dependency
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
   * Record a milestone achievement
   * Milestones are significant progress points during execution
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
   * Returns all progress events recorded for this work item
   */
  getProgressHistory(workItemId: string): ProgressEvent[] {
    return this.progressMap.get(workItemId) || [];
  }

  /**
   * Get current progress for a work item
   * Returns the most recent progress event or null if none
   */
  getCurrentProgress(workItemId: string): ProgressEvent | null {
    const events = this.progressMap.get(workItemId);
    if (!events || events.length === 0) {
      return null;
    }
    return events[events.length - 1]!;
  }

  /**
   * Check if a work item is currently being worked on
   */
  isInProgress(workItemId: string): boolean {
    const current = this.getCurrentProgress(workItemId);
    if (!current) {
      return false;
    }
    return (
      current.status === "started" ||
      current.status === "in_progress" ||
      current.status === "milestone"
    );
  }

  /**
   * Add a progress listener
   * Listener is called for every progress event
   * Returns unsubscribe function
   */
  addListener(listener: (event: ProgressEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Clear progress history for a work item
   * Used when work is cancelled or reset
   */
  clearProgress(workItemId: string): void {
    this.progressMap.delete(workItemId);
  }
}

// ============================================================================
// Error Handling & Retry Service (em3.4)
// ============================================================================

/**
 * Log levels for structured error logging
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Structured error log entry
 */
export interface ErrorLogEntry {
  timestamp: Date;
  level: LogLevel;
  workItemId: string;
  workerId: string;
  category: ErrorCategory;
  message: string;
  stack?: string;
  retryCount: number;
  willRetry: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Error history entry for tracking failures per work item
 */
export interface ErrorHistoryEntry {
  workItemId: string;
  errors: Array<{
    timestamp: Date;
    category: ErrorCategory;
    message: string;
    workerId: string;
  }>;
  totalFailures: number;
  lastFailureAt: Date;
  escalated: boolean;
}

/**
 * Escalation event emitted when errors persist beyond retry limits
 */
export interface EscalationEvent {
  workItemId: string;
  workerId: string;
  category: ErrorCategory;
  totalFailures: number;
  errorHistory: ErrorHistoryEntry;
  timestamp: Date;
  reason: string;
}

/**
 * Escalation hook type
 */
export type EscalationHook = (event: EscalationEvent) => Promise<void>;

/**
 * Handles agent failures with categorization, retry logic, escalation, and logging
 */
export class ErrorHandlingService {
  private retryQueue: Map<string, RetryContext> = new Map();
  private errorHistory: Map<string, ErrorHistoryEntry> = new Map();
  private escalationHooks: Map<string, EscalationHook> = new Map();
  private logBuffer: ErrorLogEntry[] = [];
  private maxLogBufferSize: number = 1000;

  constructor(
    private config: Pick<
      OrchestrationConfig,
      "maxRetryAttempts" | "retryBaseDelayMs" | "retryMaxDelayMs"
    >
  ) {}

  /**
   * Categorize an error for appropriate handling
   * Enhanced with additional patterns for better classification
   */
  categorizeError(error: Error | string): ErrorCategory {
    const message = error instanceof Error ? error.message : error;
    const lowerMessage = message.toLowerCase();

    // Rate limiting - check first as it's most specific
    if (
      lowerMessage.includes("rate limit") ||
      lowerMessage.includes("429") ||
      lowerMessage.includes("too many requests") ||
      lowerMessage.includes("quota exceeded") ||
      lowerMessage.includes("throttl")
    ) {
      return "rate_limited";
    }

    // Transient errors - temporary network/service issues
    if (
      lowerMessage.includes("timeout") ||
      lowerMessage.includes("timed out") ||
      lowerMessage.includes("network") ||
      lowerMessage.includes("connection") ||
      lowerMessage.includes("econnrefused") ||
      lowerMessage.includes("econnreset") ||
      lowerMessage.includes("enotfound") ||
      lowerMessage.includes("temporarily") ||
      lowerMessage.includes("unavailable") ||
      lowerMessage.includes("503") ||
      lowerMessage.includes("502") ||
      lowerMessage.includes("504") ||
      lowerMessage.includes("retry") ||
      lowerMessage.includes("socket hang up")
    ) {
      return "transient";
    }

    // Resource errors - check before validation to correctly categorize resource issues
    if (
      lowerMessage.includes("memory") ||
      lowerMessage.includes("context window") ||
      lowerMessage.includes("token limit") ||
      lowerMessage.includes("max tokens") ||
      lowerMessage.includes("resource exhausted") ||
      lowerMessage.includes("out of resource") ||
      lowerMessage.includes("insufficient") ||
      lowerMessage.includes("limit exceeded") ||
      lowerMessage.includes("heap") ||
      lowerMessage.includes("allocation")
    ) {
      return "resource";
    }

    // Validation errors - client-side issues that won't be fixed by retry
    if (
      lowerMessage.includes("invalid") ||
      lowerMessage.includes("validation") ||
      lowerMessage.includes("not found") ||
      lowerMessage.includes("does not exist") ||
      lowerMessage.includes("400") ||
      lowerMessage.includes("401") ||
      lowerMessage.includes("403") ||
      lowerMessage.includes("404") ||
      lowerMessage.includes("malformed") ||
      lowerMessage.includes("missing required") ||
      lowerMessage.includes("unauthorized") ||
      lowerMessage.includes("forbidden") ||
      lowerMessage.includes("permission denied")
    ) {
      return "validation";
    }

    // System errors - server-side issues
    if (
      lowerMessage.includes("internal") ||
      lowerMessage.includes("500") ||
      lowerMessage.includes("system") ||
      lowerMessage.includes("unexpected") ||
      lowerMessage.includes("fatal") ||
      lowerMessage.includes("crash") ||
      lowerMessage.includes("segfault") ||
      lowerMessage.includes("exception")
    ) {
      return "system";
    }

    return "unknown";
  }

  /**
   * Determine if an error should be retried based on category and attempt count
   */
  shouldRetry(category: ErrorCategory, retryCount: number): boolean {
    // Never retry validation errors - they won't be fixed by retrying
    if (category === "validation") {
      return false;
    }

    // Always retry rate limiting up to max - the delay will help
    if (category === "rate_limited") {
      return retryCount < this.config.maxRetryAttempts;
    }

    // Retry transient errors - they're expected to resolve
    if (category === "transient") {
      return retryCount < this.config.maxRetryAttempts;
    }

    // Limited retries for resource errors - may need worker restart
    if (category === "resource") {
      return retryCount < Math.min(2, this.config.maxRetryAttempts);
    }

    // Limited retries for system/unknown errors
    return retryCount < Math.min(2, this.config.maxRetryAttempts);
  }

  /**
   * Calculate delay before next retry using exponential backoff with jitter
   */
  calculateRetryDelay(retryCount: number, category: ErrorCategory): number {
    // Different base delays based on error category
    let baseDelay: number;
    switch (category) {
      case "rate_limited":
        // Longer delays for rate limiting
        baseDelay = this.config.retryBaseDelayMs * 5;
        break;
      case "resource":
        // Moderate delays for resource issues (give time to free up)
        baseDelay = this.config.retryBaseDelayMs * 3;
        break;
      case "system":
        // Standard delays for system errors
        baseDelay = this.config.retryBaseDelayMs * 2;
        break;
      default:
        baseDelay = this.config.retryBaseDelayMs;
    }

    // Exponential backoff: delay * 2^retryCount
    const exponentialDelay = baseDelay * Math.pow(2, retryCount);

    // Cap at max delay
    const cappedDelay = Math.min(exponentialDelay, this.config.retryMaxDelayMs);

    // Add jitter (±20%) to prevent thundering herd
    const jitter = cappedDelay * 0.2 * (Math.random() - 0.5);

    return Math.floor(cappedDelay + jitter);
  }

  /**
   * Schedule a retry for a failed work item
   * Returns null if no retry should be scheduled (max retries exceeded or non-retriable)
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
   * Get work items that are ready for retry (delay has elapsed)
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
   * Get a specific retry context
   */
  getRetryContext(workItemId: string): RetryContext | undefined {
    return this.retryQueue.get(workItemId);
  }

  /**
   * Get all pending retry contexts
   */
  getAllRetryContexts(): RetryContext[] {
    return Array.from(this.retryQueue.values());
  }

  // ==================== ERROR HISTORY ====================

  /**
   * Record an error in the history for tracking and debugging
   */
  recordError(
    workItemId: string,
    workerId: string,
    error: Error | string,
    category: ErrorCategory
  ): ErrorHistoryEntry {
    const message = error instanceof Error ? error.message : error;
    const now = new Date();

    let entry = this.errorHistory.get(workItemId);
    if (!entry) {
      entry = {
        workItemId,
        errors: [],
        totalFailures: 0,
        lastFailureAt: now,
        escalated: false,
      };
      this.errorHistory.set(workItemId, entry);
    }

    // Add new error to history (keep last 10 per work item)
    entry.errors.push({
      timestamp: now,
      category,
      message,
      workerId,
    });
    if (entry.errors.length > 10) {
      entry.errors.shift();
    }

    entry.totalFailures += 1;
    entry.lastFailureAt = now;

    return entry;
  }

  /**
   * Get error history for a work item
   */
  getErrorHistory(workItemId: string): ErrorHistoryEntry | undefined {
    return this.errorHistory.get(workItemId);
  }

  /**
   * Clear error history for a work item (e.g., after successful completion)
   */
  clearErrorHistory(workItemId: string): void {
    this.errorHistory.delete(workItemId);
  }

  /**
   * Get all work items with errors
   */
  getAllErrorHistory(): ErrorHistoryEntry[] {
    return Array.from(this.errorHistory.values());
  }

  // ==================== ESCALATION ====================

  /**
   * Register an escalation hook to be called when errors persist
   * @param id - Unique identifier for this hook
   * @param hook - Callback function to execute on escalation
   */
  registerEscalationHook(id: string, hook: EscalationHook): void {
    this.escalationHooks.set(id, hook);
  }

  /**
   * Unregister an escalation hook
   */
  unregisterEscalationHook(id: string): void {
    this.escalationHooks.delete(id);
  }

  /**
   * Escalate a persistent failure - call this when retries are exhausted
   * Triggers all registered escalation hooks
   */
  async escalate(
    workItemId: string,
    workerId: string,
    error: Error | string,
    category: ErrorCategory
  ): Promise<void> {
    const history = this.getErrorHistory(workItemId);

    // Mark as escalated
    if (history) {
      history.escalated = true;
    }

    const event: EscalationEvent = {
      workItemId,
      workerId,
      category,
      totalFailures: history?.totalFailures ?? 1,
      errorHistory: history ?? {
        workItemId,
        errors: [],
        totalFailures: 1,
        lastFailureAt: new Date(),
        escalated: true,
      },
      timestamp: new Date(),
      reason: `Max retries (${this.config.maxRetryAttempts}) exceeded for ${category} error`,
    };

    // Log escalation
    this.log("error", workItemId, workerId, category,
      `Escalating persistent failure: ${error instanceof Error ? error.message : error}`,
      this.config.maxRetryAttempts,
      false,
      { escalated: true, totalFailures: event.totalFailures }
    );

    // Run all escalation hooks
    for (const [id, hook] of this.escalationHooks) {
      try {
        await hook(event);
      } catch (hookError) {
        console.error(`[ErrorHandling] Escalation hook ${id} failed:`, hookError);
      }
    }
  }

  /**
   * Check if a work item has been escalated
   */
  isEscalated(workItemId: string): boolean {
    const history = this.errorHistory.get(workItemId);
    return history?.escalated ?? false;
  }

  // ==================== STRUCTURED LOGGING ====================

  /**
   * Log error with full context for debugging
   * Stores in buffer and outputs to console with structured format
   */
  logError(
    workItemId: string,
    workerId: string,
    error: Error | string,
    category: ErrorCategory,
    retryCount: number = 0,
    willRetry: boolean = false,
    metadata?: Record<string, unknown>
  ): void {
    const message = error instanceof Error ? error.message : error;
    const stack = error instanceof Error ? error.stack : undefined;

    this.log("error", workItemId, workerId, category, message, retryCount, willRetry, {
      ...metadata,
      stack,
    });
  }

  /**
   * Log with specified level
   */
  log(
    level: LogLevel,
    workItemId: string,
    workerId: string,
    category: ErrorCategory,
    message: string,
    retryCount: number,
    willRetry: boolean,
    metadata?: Record<string, unknown>
  ): void {
    const stackValue = metadata?.stack as string | undefined;
    const metadataWithoutStack = metadata ? Object.fromEntries(
      Object.entries(metadata).filter(([key]) => key !== "stack")
    ) : undefined;
    const hasMetadata = metadataWithoutStack && Object.keys(metadataWithoutStack).length > 0;

    const entry: ErrorLogEntry = {
      timestamp: new Date(),
      level,
      workItemId,
      workerId,
      category,
      message,
      retryCount,
      willRetry,
      ...(stackValue !== undefined && { stack: stackValue }),
      ...(hasMetadata && { metadata: metadataWithoutStack }),
    };

    // Add to buffer
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.maxLogBufferSize) {
      this.logBuffer.shift();
    }

    // Output to console with structured format
    const logFn = level === "error" ? console.error :
                  level === "warn" ? console.warn :
                  level === "debug" ? console.debug : console.log;

    const prefix = `[Orchestration:${level.toUpperCase()}]`;
    const retryInfo = willRetry ? ` (will retry: attempt ${retryCount + 1}/${this.config.maxRetryAttempts})` :
                      retryCount > 0 ? ` (retries exhausted after ${retryCount} attempts)` : "";

    logFn(
      `${prefix} [${category}] Work item ${workItemId} (worker: ${workerId})${retryInfo}: ${message}`,
      {
        timestamp: entry.timestamp.toISOString(),
        category,
        workItemId,
        workerId,
        retryCount,
        willRetry,
        ...(entry.stack ? { stack: entry.stack } : {}),
        ...(entry.metadata && Object.keys(entry.metadata).length > 0 ? { metadata: entry.metadata } : {}),
      }
    );
  }

  /**
   * Get recent log entries
   * @param limit - Maximum number of entries to return
   * @param filter - Optional filter criteria
   */
  getRecentLogs(
    limit: number = 100,
    filter?: {
      level?: LogLevel;
      category?: ErrorCategory;
      workItemId?: string;
      workerId?: string;
    }
  ): ErrorLogEntry[] {
    let logs = [...this.logBuffer];

    // Apply filters
    if (filter) {
      if (filter.level) {
        logs = logs.filter(log => log.level === filter.level);
      }
      if (filter.category) {
        logs = logs.filter(log => log.category === filter.category);
      }
      if (filter.workItemId) {
        logs = logs.filter(log => log.workItemId === filter.workItemId);
      }
      if (filter.workerId) {
        logs = logs.filter(log => log.workerId === filter.workerId);
      }
    }

    // Return most recent first, limited
    return logs.slice(-limit).reverse();
  }

  /**
   * Clear the log buffer
   */
  clearLogs(): void {
    this.logBuffer = [];
  }

  /**
   * Get error summary statistics
   */
  getErrorStats(): {
    totalErrors: number;
    byCategory: Record<ErrorCategory, number>;
    byWorkItem: number;
    escalatedCount: number;
    pendingRetries: number;
  } {
    const byCategory: Record<ErrorCategory, number> = {
      transient: 0,
      rate_limited: 0,
      resource: 0,
      validation: 0,
      system: 0,
      unknown: 0,
    };

    let totalErrors = 0;
    let escalatedCount = 0;

    for (const history of this.errorHistory.values()) {
      totalErrors += history.totalFailures;
      if (history.escalated) {
        escalatedCount++;
      }
      for (const error of history.errors) {
        byCategory[error.category]++;
      }
    }

    return {
      totalErrors,
      byCategory,
      byWorkItem: this.errorHistory.size,
      escalatedCount,
      pendingRetries: this.retryQueue.size,
    };
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
    private config: OrchestrationConfig = DEFAULT_CONFIG,
    private templateRepo?: TemplateRepository
  ) {
    // Initialize sub-services
    this.queueManager = new WorkItemQueueManager(workItemRepo);
    this.assignmentService = new AgentAssignmentService(
      workerRepo,
      workerPool,
      templateRepo
    );
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

        // Record repository experience for future assignment optimization
        if (workItem.repositoryId) {
          this.assignmentService.recordRepoExperience(worker.id, workItem.repositoryId);
        }

        // Clear any error history on success (work item recovered)
        this.errorHandling.clearErrorHistory(workItem.id);

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
   * Handle an execution error with enhanced logging, history tracking, and escalation
   */
  private async handleExecutionError(
    workItem: WorkItem,
    worker: Worker,
    executionId: string,
    error: string,
    retryCount: number
  ): Promise<void> {
    // Categorize the error
    const category = this.errorHandling.categorizeError(error);

    // Record error in history for tracking
    this.errorHandling.recordError(workItem.id, worker.id, error, category);

    // Determine if we will retry
    const willRetry = this.errorHandling.shouldRetry(category, retryCount);

    // Log with enhanced structured logging
    this.errorHandling.logError(
      workItem.id,
      worker.id,
      error,
      category,
      retryCount,
      willRetry,
      {
        executionId,
        workItemType: workItem.type,
        workItemTitle: workItem.title,
        repositoryId: workItem.repositoryId,
      }
    );

    // Track failure in progress service
    await this.progressTracking.markFailed(
      workItem.id,
      worker.id,
      executionId,
      error
    );

    // Run error hooks from lifecycle service
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
      // Retry scheduled - log info level
      this.errorHandling.log(
        "info",
        workItem.id,
        worker.id,
        category,
        `Scheduled retry #${retryContext.retryCount} at ${retryContext.nextRetryAt.toISOString()}`,
        retryCount,
        true,
        { nextRetryDelay: retryContext.nextRetryAt.getTime() - Date.now() }
      );
    } else {
      // No more retries - escalate the failure
      await this.errorHandling.escalate(workItem.id, worker.id, error, category);

      // Move work item back to backlog for manual intervention
      try {
        await this.workflowEngine.transition(workItem.id, "backlog");
        this.errorHandling.log(
          "warn",
          workItem.id,
          worker.id,
          category,
          "Work item transitioned to backlog after exhausting retries",
          retryCount,
          false,
          { finalStatus: "backlog" }
        );
      } catch (transitionError) {
        const transitionMessage = transitionError instanceof Error
          ? transitionError.message
          : String(transitionError);
        this.errorHandling.log(
          "error",
          workItem.id,
          worker.id,
          category,
          `Failed to transition to backlog: ${transitionMessage}`,
          retryCount,
          false,
          { transitionError: transitionMessage }
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
