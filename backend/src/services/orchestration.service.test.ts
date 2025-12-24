import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import {
  OrchestrationService,
  WorkItemQueueManager,
  AgentAssignmentService,
  ProgressTrackingService,
  ErrorHandlingService,
  ConcurrencyLimitsService,
  type OrchestrationConfig,
} from "./orchestration.service.js";
import { WorkflowEngineService } from "./workflow-engine.service.js";
import { WorkerPoolService } from "./worker-pool.service.js";
import { AgentExecutorService } from "./agent-executor.service.js";
import { AgentLifecycleService } from "./agent-lifecycle.service.js";
import { WorkItemRepository } from "../repositories/work-item.repository.js";
import { WorkerRepository } from "../repositories/worker.repository.js";
import { AgentExecutionRepository } from "../repositories/agent-execution.repository.js";
import type { NewWorkItem, NewWorker, NewTemplate, WorkItem, Worker } from "../db/schema.js";
import { v4 as uuidv4 } from "uuid";

describe("OrchestrationService", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let workItemRepo: WorkItemRepository;
  let workerRepo: WorkerRepository;
  let agentExecutionRepo: AgentExecutionRepository;
  let workflowEngine: WorkflowEngineService;
  let workerPool: WorkerPoolService;
  let agentExecutor: AgentExecutorService;
  let agentLifecycle: AgentLifecycleService;
  let orchestrationService: OrchestrationService;
  let testTemplateId: string;

  beforeEach(async () => {
    // Create in-memory database for testing
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    db = drizzle(sqlite, { schema });

    // Create tables
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS github_connections (
        id TEXT PRIMARY KEY,
        github_user_id INTEGER NOT NULL UNIQUE,
        github_username TEXT NOT NULL,
        github_avatar_url TEXT,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        token_expires_at INTEGER,
        scopes TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS repositories (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL REFERENCES github_connections(id) ON DELETE CASCADE,
        github_repo_id INTEGER NOT NULL,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        full_name TEXT NOT NULL,
        html_url TEXT NOT NULL,
        description TEXT,
        default_branch TEXT NOT NULL DEFAULT 'main',
        is_private INTEGER NOT NULL DEFAULT 0,
        sync_enabled INTEGER NOT NULL DEFAULT 1,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        sync_error TEXT,
        last_sync_at INTEGER,
        issue_labels_filter TEXT NOT NULL DEFAULT '[]',
        auto_assign_agents INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        permission_mode TEXT NOT NULL DEFAULT 'askUser',
        max_turns INTEGER NOT NULL DEFAULT 100,
        builtin_tools TEXT NOT NULL DEFAULT '[]',
        mcp_servers TEXT NOT NULL DEFAULT '[]',
        allowed_work_item_types TEXT NOT NULL DEFAULT '["*"]',
        default_role TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS work_items (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'backlog',
        repository_id TEXT,
        github_issue_id INTEGER,
        github_issue_number INTEGER,
        github_issue_url TEXT,
        description TEXT NOT NULL DEFAULT '',
        success_criteria TEXT NOT NULL DEFAULT '[]',
        linked_files TEXT NOT NULL DEFAULT '[]',
        created_by TEXT NOT NULL,
        assigned_agents TEXT NOT NULL DEFAULT '{}',
        requires_approval TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        parent_id TEXT,
        child_ids TEXT NOT NULL DEFAULT '[]',
        blocked_by TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS workers (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'idle',
        current_work_item_id TEXT,
        current_role TEXT,
        session_id TEXT NOT NULL,
        spawned_at INTEGER NOT NULL,
        context_window_used INTEGER NOT NULL DEFAULT 0,
        context_window_limit INTEGER NOT NULL DEFAULT 200000,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        tool_calls INTEGER NOT NULL DEFAULT 0,
        errors INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (template_id) REFERENCES templates(id),
        FOREIGN KEY (current_work_item_id) REFERENCES work_items(id)
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        worker_id TEXT REFERENCES workers(id),
        work_item_id TEXT REFERENCES work_items(id),
        repository_id TEXT REFERENCES repositories(id),
        path TEXT NOT NULL,
        branch_name TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        cleanup_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS agent_executions (
        id TEXT PRIMARY KEY,
        worker_id TEXT REFERENCES workers(id),
        work_item_id TEXT REFERENCES work_items(id),
        workspace_id TEXT REFERENCES workspaces(id),
        template_id TEXT REFERENCES templates(id),
        status TEXT NOT NULL DEFAULT 'pending',
        started_at INTEGER,
        completed_at INTEGER,
        duration_ms INTEGER,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        tool_calls_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        output TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS traces (
        id TEXT PRIMARY KEY,
        worker_id TEXT REFERENCES workers(id),
        work_item_id TEXT REFERENCES work_items(id),
        event_type TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        timestamp INTEGER NOT NULL
      );
    `);

    // Initialize repositories
    workItemRepo = new WorkItemRepository(db);
    workerRepo = new WorkerRepository(db);
    agentExecutionRepo = new AgentExecutionRepository(db);

    // Initialize services
    workflowEngine = new WorkflowEngineService(workItemRepo, workerRepo);
    workerPool = new WorkerPoolService(workerRepo, { maxWorkers: 10 });

    // Mock the Claude SDK query for agent executor
    const mockClaudeQuery = vi.fn().mockResolvedValue({
      sessionId: "mock-session",
      tokensUsed: 100,
      costUsd: 0.001,
      toolCallsCount: 5,
    });
    agentExecutor = new AgentExecutorService(db, mockClaudeQuery);
    agentLifecycle = new AgentLifecycleService();

    // Create a test template for foreign key constraints
    testTemplateId = uuidv4();
    const now = new Date();
    const testTemplate: NewTemplate = {
      id: testTemplateId,
      name: "Test Template",
      description: "A test template",
      createdBy: "system",
      systemPrompt: "You are a test agent",
      permissionMode: "askUser",
      maxTurns: 100,
      builtinTools: [],
      mcpServers: [],
      allowedWorkItemTypes: ["*"],
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(schema.templates).values(testTemplate);

    // Initialize orchestration service with test config
    const config: OrchestrationConfig = {
      cycleIntervalMs: 100, // Fast for testing
      maxGlobalWorkers: 5,
      maxWorkersPerRepo: 2,
      maxWorkersPerUser: 3,
      maxRetryAttempts: 3,
      retryBaseDelayMs: 10,
      retryMaxDelayMs: 100,
      autoSpawnWorkers: false,
    };

    orchestrationService = new OrchestrationService(
      workItemRepo,
      workerRepo,
      agentExecutionRepo,
      workflowEngine,
      workerPool,
      agentExecutor,
      agentLifecycle,
      undefined, // observability
      undefined, // websocket
      config
    );
  });

  afterEach(async () => {
    await orchestrationService.stop();
    sqlite.close();
    vi.clearAllMocks();
  });

  // Helper to create a test work item
  async function createTestWorkItem(
    overrides: Partial<NewWorkItem> = {}
  ): Promise<WorkItem> {
    const now = new Date();
    const workItem: NewWorkItem = {
      id: uuidv4(),
      title: "Test Work Item",
      type: "feature",
      status: "backlog",
      description: "Test description",
      successCriteria: [],
      linkedFiles: [],
      createdBy: "test-user",
      assignedAgents: {},
      requiresApproval: {},
      createdAt: now,
      updatedAt: now,
      childIds: [],
      blockedBy: [],
      ...overrides,
    };

    return await workItemRepo.create(workItem);
  }

  // Helper to create a test worker
  async function createTestWorker(
    overrides: Partial<NewWorker> = {}
  ): Promise<Worker> {
    const worker: NewWorker = {
      id: uuidv4(),
      templateId: testTemplateId,
      status: "idle",
      sessionId: uuidv4(),
      spawnedAt: new Date(),
      contextWindowUsed: 0,
      contextWindowLimit: 200000,
      tokensUsed: 0,
      costUsd: 0,
      toolCalls: 0,
      errors: 0,
      ...overrides,
    };

    return await workerRepo.create(worker);
  }

  // ============================================================================
  // WorkItemQueueManager Tests
  // ============================================================================

  describe("WorkItemQueueManager", () => {
    let queueManager: WorkItemQueueManager;

    beforeEach(() => {
      queueManager = new WorkItemQueueManager(workItemRepo);
    });

    it("should refresh queue with ready work items", async () => {
      await createTestWorkItem({ status: "ready" });
      await createTestWorkItem({ status: "ready" });
      await createTestWorkItem({ status: "backlog" }); // Should not be in queue

      await queueManager.refreshQueue();

      expect(queueManager.getQueueLength()).toBe(2);
    });

    it("should skip blocked work items", async () => {
      const blocker = await createTestWorkItem({ status: "backlog" });
      await createTestWorkItem({ status: "ready", blockedBy: [blocker.id] });
      await createTestWorkItem({ status: "ready" }); // Not blocked

      await queueManager.refreshQueue();

      // Only the non-blocked item should be in queue
      expect(queueManager.getQueueLength()).toBe(1);
    });

    it("should prioritize bugs over features", async () => {
      await createTestWorkItem({ status: "ready", type: "feature" });
      await createTestWorkItem({ status: "ready", type: "bug" });

      await queueManager.refreshQueue();
      const first = await queueManager.getNext();

      expect(first?.workItem.type).toBe("bug");
    });

    it("should not duplicate items in queue", async () => {
      await createTestWorkItem({ status: "ready" });

      await queueManager.refreshQueue();
      await queueManager.refreshQueue(); // Refresh again

      expect(queueManager.getQueueLength()).toBe(1);
    });

    it("should requeue items with lower priority", async () => {
      const item = await createTestWorkItem({ status: "ready" });

      await queueManager.refreshQueue();
      const queuedItem = await queueManager.getNext();

      // Requeue with error
      queueManager.requeue(queuedItem!, "Test error");

      expect(queueManager.getQueueLength()).toBe(1);
      const requeuedItems = queueManager.getQueueItems();
      expect(requeuedItems[0].retryCount).toBe(1);
      expect(requeuedItems[0].lastError).toBe("Test error");
    });

    it("should remove items from queue", async () => {
      const item = await createTestWorkItem({ status: "ready" });

      await queueManager.refreshQueue();
      queueManager.remove(item.id);

      expect(queueManager.getQueueLength()).toBe(0);
    });
  });

  // ============================================================================
  // AgentAssignmentService Tests
  // ============================================================================

  describe("AgentAssignmentService", () => {
    let assignmentService: AgentAssignmentService;

    beforeEach(() => {
      assignmentService = new AgentAssignmentService(workerRepo, workerPool);
    });

    it("should find best available worker", async () => {
      await createTestWorker({ status: "idle" });
      await createTestWorker({ status: "working" }); // Not available

      const workItem = await createTestWorkItem({ status: "ready" });
      const worker = await assignmentService.findBestWorker(
        workItem,
        "implementer"
      );

      expect(worker).not.toBeNull();
      expect(worker?.status).toBe("idle");
    });

    it("should return null when no workers available", async () => {
      await createTestWorker({ status: "working" });

      const workItem = await createTestWorkItem({ status: "ready" });
      const worker = await assignmentService.findBestWorker(
        workItem,
        "implementer"
      );

      expect(worker).toBeNull();
    });

    it("should prefer workers with fewer errors", async () => {
      await createTestWorker({ status: "idle", errors: 5 });
      const goodWorker = await createTestWorker({ status: "idle", errors: 0 });

      const workItem = await createTestWorkItem({ status: "ready" });
      const worker = await assignmentService.findBestWorker(
        workItem,
        "implementer"
      );

      expect(worker?.id).toBe(goodWorker.id);
    });

    it("should determine correct role for work item status", () => {
      const backlogItem = { status: "backlog" } as WorkItem;
      const readyItem = { status: "ready" } as WorkItem;
      const inProgressItem = { status: "in_progress" } as WorkItem;
      const reviewItem = { status: "review" } as WorkItem;

      expect(assignmentService.determineRole(backlogItem)).toBe("refiner");
      expect(assignmentService.determineRole(readyItem)).toBe("implementer");
      expect(assignmentService.determineRole(inProgressItem)).toBe("tester");
      expect(assignmentService.determineRole(reviewItem)).toBe("reviewer");
    });
  });

  // ============================================================================
  // ProgressTrackingService Tests
  // ============================================================================

  describe("ProgressTrackingService", () => {
    let progressTracking: ProgressTrackingService;

    beforeEach(() => {
      progressTracking = new ProgressTrackingService(workItemRepo);
    });

    it("should record progress events", async () => {
      const workItem = await createTestWorkItem({ status: "ready" });
      const worker = await createTestWorker();

      await progressTracking.markStarted(workItem.id, worker.id, "exec-1");

      const history = progressTracking.getProgressHistory(workItem.id);
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe("started");
    });

    it("should notify listeners of progress events", async () => {
      const workItem = await createTestWorkItem({ status: "ready" });
      const worker = await createTestWorker();

      const events: any[] = [];
      progressTracking.addListener((event) => events.push(event));

      await progressTracking.markStarted(workItem.id, worker.id, "exec-1");
      await progressTracking.recordMilestone(
        workItem.id,
        worker.id,
        "Testing milestone",
        50
      );

      expect(events).toHaveLength(2);
      expect(events[1].message).toBe("Testing milestone");
      expect(events[1].progress).toBe(50);
    });

    it("should clear history after completion", async () => {
      const workItem = await createTestWorkItem({ status: "ready" });
      const worker = await createTestWorker();

      await progressTracking.markStarted(workItem.id, worker.id, "exec-1");
      await progressTracking.markCompleted(workItem.id, worker.id, "exec-1");

      const history = progressTracking.getProgressHistory(workItem.id);
      expect(history).toHaveLength(0);
    });

    it("should remove listener correctly", async () => {
      const workItem = await createTestWorkItem({ status: "ready" });
      const worker = await createTestWorker();

      const events: any[] = [];
      const removeListener = progressTracking.addListener((event) =>
        events.push(event)
      );

      await progressTracking.markStarted(workItem.id, worker.id, "exec-1");
      removeListener();
      await progressTracking.markCompleted(workItem.id, worker.id, "exec-1");

      // Only the first event should be recorded
      expect(events).toHaveLength(1);
    });
  });

  // ============================================================================
  // ErrorHandlingService Tests
  // ============================================================================

  describe("ErrorHandlingService", () => {
    let errorHandling: ErrorHandlingService;

    beforeEach(() => {
      errorHandling = new ErrorHandlingService({
        maxRetryAttempts: 3,
        retryBaseDelayMs: 100,
        retryMaxDelayMs: 1000,
      });
    });

    it("should categorize rate limit errors", () => {
      expect(errorHandling.categorizeError("Rate limit exceeded")).toBe(
        "rate_limited"
      );
      expect(errorHandling.categorizeError("429 Too Many Requests")).toBe(
        "rate_limited"
      );
    });

    it("should categorize transient errors", () => {
      expect(errorHandling.categorizeError("Connection timeout")).toBe(
        "transient"
      );
      expect(errorHandling.categorizeError("Network error")).toBe("transient");
      expect(errorHandling.categorizeError("503 Service Unavailable")).toBe(
        "transient"
      );
    });

    it("should categorize validation errors", () => {
      expect(errorHandling.categorizeError("Invalid input")).toBe("validation");
      expect(errorHandling.categorizeError("Resource not found")).toBe(
        "validation"
      );
      expect(errorHandling.categorizeError("400 Bad Request")).toBe(
        "validation"
      );
    });

    it("should categorize resource errors", () => {
      expect(errorHandling.categorizeError("Out of memory")).toBe("resource");
      expect(errorHandling.categorizeError("Context window exceeded")).toBe(
        "resource"
      );
    });

    it("should not retry validation errors", () => {
      expect(
        errorHandling.shouldRetry("validation", 0)
      ).toBe(false);
    });

    it("should retry transient errors up to max attempts", () => {
      expect(errorHandling.shouldRetry("transient", 0)).toBe(true);
      expect(errorHandling.shouldRetry("transient", 1)).toBe(true);
      expect(errorHandling.shouldRetry("transient", 2)).toBe(true);
      expect(errorHandling.shouldRetry("transient", 3)).toBe(false);
    });

    it("should calculate exponential backoff delay", () => {
      const delay0 = errorHandling.calculateRetryDelay(0, "transient");
      const delay1 = errorHandling.calculateRetryDelay(1, "transient");
      const delay2 = errorHandling.calculateRetryDelay(2, "transient");

      // With jitter, delays should be approximately exponential
      expect(delay0).toBeLessThan(delay1);
      expect(delay1).toBeLessThan(delay2);
    });

    it("should use longer delays for rate limited errors", () => {
      const normalDelay = errorHandling.calculateRetryDelay(0, "transient");
      const rateLimitDelay = errorHandling.calculateRetryDelay(
        0,
        "rate_limited"
      );

      expect(rateLimitDelay).toBeGreaterThan(normalDelay);
    });

    it("should schedule retries", () => {
      const context = errorHandling.scheduleRetry(
        "work-1",
        "Connection timeout",
        0
      );

      expect(context).not.toBeNull();
      expect(context?.workItemId).toBe("work-1");
      expect(context?.retryCount).toBe(1);
      expect(context?.errorCategory).toBe("transient");
    });

    it("should return null when max retries exceeded", () => {
      const context = errorHandling.scheduleRetry(
        "work-1",
        "Connection timeout",
        3
      );

      expect(context).toBeNull();
    });

    it("should get ready retries", async () => {
      // Schedule a retry with very short delay
      vi.useFakeTimers();
      errorHandling.scheduleRetry("work-1", "Connection timeout", 0);

      // Advance time
      vi.advanceTimersByTime(200);

      const readyRetries = errorHandling.getReadyRetries();
      expect(readyRetries).toHaveLength(1);
      expect(readyRetries[0].workItemId).toBe("work-1");

      vi.useRealTimers();
    });

    it("should cancel scheduled retries", () => {
      errorHandling.scheduleRetry("work-1", "Connection timeout", 0);
      expect(errorHandling.getPendingRetryCount()).toBe(1);

      errorHandling.cancelRetry("work-1");
      expect(errorHandling.getPendingRetryCount()).toBe(0);
    });
  });

  // ============================================================================
  // ConcurrencyLimitsService Tests
  // ============================================================================

  describe("ConcurrencyLimitsService", () => {
    let concurrencyLimits: ConcurrencyLimitsService;

    beforeEach(() => {
      concurrencyLimits = new ConcurrencyLimitsService({
        maxGlobalWorkers: 3,
        maxWorkersPerRepo: 2,
        maxWorkersPerUser: 2,
      });
    });

    it("should allow execution within limits", () => {
      const workItem = { createdBy: "user-1", repositoryId: "repo-1" } as WorkItem;
      const result = concurrencyLimits.canStartExecution(workItem);

      expect(result.allowed).toBe(true);
    });

    it("should block when global limit reached", () => {
      // Register 3 executions
      for (let i = 0; i < 3; i++) {
        concurrencyLimits.registerStart(
          { createdBy: `user-${i}`, repositoryId: `repo-${i}` } as WorkItem,
          `worker-${i}`
        );
      }

      const result = concurrencyLimits.canStartExecution({
        createdBy: "user-new",
      } as WorkItem);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Global concurrent limit");
    });

    it("should block when per-repo limit reached", () => {
      concurrencyLimits.registerStart(
        { createdBy: "user-1", repositoryId: "repo-1" } as WorkItem,
        "worker-1"
      );
      concurrencyLimits.registerStart(
        { createdBy: "user-2", repositoryId: "repo-1" } as WorkItem,
        "worker-2"
      );

      const result = concurrencyLimits.canStartExecution({
        createdBy: "user-3",
        repositoryId: "repo-1",
      } as WorkItem);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Per-repository limit");
    });

    it("should block when per-user limit reached", () => {
      concurrencyLimits.registerStart(
        { createdBy: "user-1", repositoryId: "repo-1" } as WorkItem,
        "worker-1"
      );
      concurrencyLimits.registerStart(
        { createdBy: "user-1", repositoryId: "repo-2" } as WorkItem,
        "worker-2"
      );

      const result = concurrencyLimits.canStartExecution({
        createdBy: "user-1",
        repositoryId: "repo-3",
      } as WorkItem);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Per-user limit");
    });

    it("should track completions correctly", () => {
      const workItem = { createdBy: "user-1", repositoryId: "repo-1" } as WorkItem;

      concurrencyLimits.registerStart(workItem, "worker-1");
      expect(concurrencyLimits.getStatus().global.current).toBe(1);

      concurrencyLimits.registerCompletion(workItem, "worker-1");
      expect(concurrencyLimits.getStatus().global.current).toBe(0);
    });

    it("should return correct status", () => {
      concurrencyLimits.registerStart(
        { createdBy: "user-1", repositoryId: "repo-1" } as WorkItem,
        "worker-1"
      );

      const status = concurrencyLimits.getStatus();

      expect(status.global.current).toBe(1);
      expect(status.global.max).toBe(3);
      expect(status.byRepo["repo-1"]?.current).toBe(1);
      expect(status.byUser["user-1"]?.current).toBe(1);
    });

    it("should update config dynamically", () => {
      concurrencyLimits.updateConfig({ maxGlobalWorkers: 10 });

      const status = concurrencyLimits.getStatus();
      expect(status.global.max).toBe(10);
    });
  });

  // ============================================================================
  // OrchestrationService Integration Tests
  // ============================================================================

  describe("OrchestrationService Integration", () => {
    it("should start and stop orchestration loop", async () => {
      await orchestrationService.start();
      expect(orchestrationService.getStatus().isRunning).toBe(true);

      await orchestrationService.stop();
      expect(orchestrationService.getStatus().isRunning).toBe(false);
    });

    it("should not start twice", async () => {
      await orchestrationService.start();
      await orchestrationService.start(); // Should not throw

      expect(orchestrationService.getStatus().isRunning).toBe(true);
      await orchestrationService.stop();
    });

    it("should force a single cycle", async () => {
      await createTestWorkItem({ status: "ready" });

      const statusBefore = orchestrationService.getStatus();
      expect(statusBefore.cycleCount).toBe(0);

      await orchestrationService.forceCycle();

      const statusAfter = orchestrationService.getStatus();
      expect(statusAfter.cycleCount).toBe(1);
      expect(statusAfter.lastCycleAt).toBeDefined();
    });

    it("should update configuration dynamically", () => {
      orchestrationService.updateConfig({ maxGlobalWorkers: 20 });

      const status = orchestrationService.getConcurrencyStatus();
      expect(status.global.max).toBe(20);
    });

    it("should provide access to sub-services", () => {
      expect(orchestrationService.getQueueManager()).toBeInstanceOf(
        WorkItemQueueManager
      );
      expect(orchestrationService.getAssignmentService()).toBeInstanceOf(
        AgentAssignmentService
      );
      expect(orchestrationService.getProgressTracking()).toBeInstanceOf(
        ProgressTrackingService
      );
      expect(orchestrationService.getErrorHandling()).toBeInstanceOf(
        ErrorHandlingService
      );
      expect(orchestrationService.getConcurrencyLimits()).toBeInstanceOf(
        ConcurrencyLimitsService
      );
    });

    it("should get queue items for monitoring", async () => {
      await createTestWorkItem({ status: "ready" });
      await orchestrationService.forceCycle();

      // The queue should have been populated during the cycle
      // (items may have been processed and removed, so check status)
      const status = orchestrationService.getStatus();
      expect(status.cycleCount).toBe(1);
    });

    it("should report correct orchestrator status", async () => {
      const status = orchestrationService.getStatus();

      expect(status).toHaveProperty("isRunning");
      expect(status).toHaveProperty("cycleCount");
      expect(status).toHaveProperty("queueLength");
      expect(status).toHaveProperty("activeAssignments");
      expect(status).toHaveProperty("pendingRetries");
      expect(status).toHaveProperty("workersAvailable");
      expect(status).toHaveProperty("workersActive");
    });

    it("should report correct concurrency status", () => {
      const status = orchestrationService.getConcurrencyStatus();

      expect(status).toHaveProperty("global");
      expect(status).toHaveProperty("byRepo");
      expect(status).toHaveProperty("byUser");
      expect(status.global).toHaveProperty("current");
      expect(status.global).toHaveProperty("max");
    });
  });
});
