import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import { WorkflowEngineService } from "./workflow-engine.service.js";
import { WorkItemRepository } from "../features/work-items/repositories/work-item.repository.js";
import { WorkerRepository } from "../repositories/worker.repository.js";
import type { NewWorkItem, NewWorker, NewTemplate } from "../db/schema.js";
import { v4 as uuidv4 } from "uuid";

describe("WorkflowEngineService", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let workflowEngine: WorkflowEngineService;
  let workItemRepo: WorkItemRepository;
  let workerRepo: WorkerRepository;
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
    `);

    // Initialize repositories and service
    workItemRepo = new WorkItemRepository(db);
    workerRepo = new WorkerRepository(db);
    workflowEngine = new WorkflowEngineService(workItemRepo, workerRepo);

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
  });

  afterEach(() => {
    sqlite.close();
  });

  // Helper to create a test work item
  async function createTestWorkItem(
    overrides: Partial<NewWorkItem> = {}
  ): Promise<string> {
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

    const created = await workItemRepo.create(workItem);
    return created.id;
  }

  // Helper to create a test worker
  async function createTestWorker(
    overrides: Partial<NewWorker> = {}
  ): Promise<string> {
    const worker: NewWorker = {
      id: uuidv4(),
      templateId: testTemplateId,
      status: "idle",
      sessionId: uuidv4(),
      spawnedAt: new Date(),
      ...overrides,
    };

    const created = await workerRepo.create(worker);
    return created.id;
  }

  describe("canTransition", () => {
    it("should allow valid transition from backlog to ready", async () => {
      const itemId = await createTestWorkItem({ status: "backlog" });
      const canTransition = await workflowEngine.canTransition(itemId, "ready");
      expect(canTransition).toBe(true);
    });

    it("should allow valid transition from ready to in_progress", async () => {
      const itemId = await createTestWorkItem({ status: "ready" });
      const canTransition = await workflowEngine.canTransition(
        itemId,
        "in_progress"
      );
      expect(canTransition).toBe(true);
    });

    it("should allow valid transition from in_progress to review", async () => {
      const itemId = await createTestWorkItem({ status: "in_progress" });
      const canTransition = await workflowEngine.canTransition(itemId, "review");
      expect(canTransition).toBe(true);
    });

    it("should allow valid transition from review to done", async () => {
      const itemId = await createTestWorkItem({ status: "review" });
      const canTransition = await workflowEngine.canTransition(itemId, "done");
      expect(canTransition).toBe(true);
    });

    it("should allow valid transition from review to in_progress (reject)", async () => {
      const itemId = await createTestWorkItem({ status: "review" });
      const canTransition = await workflowEngine.canTransition(
        itemId,
        "in_progress"
      );
      expect(canTransition).toBe(true);
    });

    it("should allow valid transition from in_progress to backlog (cancel)", async () => {
      const itemId = await createTestWorkItem({ status: "in_progress" });
      const canTransition = await workflowEngine.canTransition(
        itemId,
        "backlog"
      );
      expect(canTransition).toBe(true);
    });

    it("should allow valid transition from ready to backlog (deprioritize)", async () => {
      const itemId = await createTestWorkItem({ status: "ready" });
      const canTransition = await workflowEngine.canTransition(
        itemId,
        "backlog"
      );
      expect(canTransition).toBe(true);
    });

    it("should allow any_to_backlog transition from any status except backlog", async () => {
      const statuses = ["ready", "in_progress", "review", "done"] as const;
      for (const status of statuses) {
        const itemId = await createTestWorkItem({ status });
        const canTransition = await workflowEngine.canTransition(
          itemId,
          "backlog"
        );
        expect(canTransition).toBe(true);
      }
    });

    it("should reject invalid transition from backlog to review", async () => {
      const itemId = await createTestWorkItem({ status: "backlog" });
      const canTransition = await workflowEngine.canTransition(itemId, "review");
      expect(canTransition).toBe(false);
    });

    it("should reject transition from done to any other state", async () => {
      const itemId = await createTestWorkItem({ status: "done" });
      const canTransition = await workflowEngine.canTransition(itemId, "review");
      expect(canTransition).toBe(false);
    });

    it("should reject transition if work item is blocked", async () => {
      const blockerId = await createTestWorkItem({ status: "backlog" });
      const itemId = await createTestWorkItem({
        status: "backlog",
        blockedBy: [blockerId],
      });

      const canTransition = await workflowEngine.canTransition(itemId, "ready");
      expect(canTransition).toBe(false);
    });

    it("should allow transition if blockers are resolved", async () => {
      const blockerId = await createTestWorkItem({ status: "done" });
      const itemId = await createTestWorkItem({
        status: "backlog",
        blockedBy: [blockerId],
      });

      const canTransition = await workflowEngine.canTransition(itemId, "ready");
      expect(canTransition).toBe(true);
    });

    it("should throw error for non-existent work item", async () => {
      await expect(
        workflowEngine.canTransition("non-existent", "ready")
      ).rejects.toThrow("Work item not found");
    });
  });

  describe("transition", () => {
    it("should successfully transition work item status", async () => {
      const itemId = await createTestWorkItem({ status: "backlog" });
      await workflowEngine.transition(itemId, "ready");

      const item = await workItemRepo.findById(itemId);
      expect(item?.status).toBe("ready");
    });

    it("should set startedAt when transitioning to in_progress", async () => {
      const itemId = await createTestWorkItem({ status: "ready" });
      await workflowEngine.transition(itemId, "in_progress");

      const item = await workItemRepo.findById(itemId);
      expect(item?.status).toBe("in_progress");
      expect(item?.startedAt).toBeDefined();
    });

    it("should set completedAt when transitioning to done", async () => {
      const itemId = await createTestWorkItem({ status: "review" });
      await workflowEngine.transition(itemId, "done");

      const item = await workItemRepo.findById(itemId);
      expect(item?.status).toBe("done");
      expect(item?.completedAt).toBeDefined();
    });

    it("should throw error for invalid transition", async () => {
      const itemId = await createTestWorkItem({ status: "backlog" });
      await expect(
        workflowEngine.transition(itemId, "review")
      ).rejects.toThrow("Invalid transition");
    });

    it("should throw error if approval is required but not provided", async () => {
      const itemId = await createTestWorkItem({
        status: "backlog",
        requiresApproval: { backlog_to_ready: true },
      });

      await expect(
        workflowEngine.transition(itemId, "ready")
      ).rejects.toThrow("Approval required");
    });

    it("should allow transition if approval is required and provided", async () => {
      const itemId = await createTestWorkItem({
        status: "backlog",
        requiresApproval: { backlog_to_ready: true },
      });

      await workflowEngine.requireApproval(itemId, "backlog_to_ready", true);
      await workflowEngine.approveTransition(
        itemId,
        "backlog_to_ready",
        "approver-1"
      );
      await workflowEngine.transition(itemId, "ready");

      const item = await workItemRepo.findById(itemId);
      expect(item?.status).toBe("ready");
    });

    it("should throw error if work item is blocked", async () => {
      const blockerId = await createTestWorkItem({ status: "backlog" });
      const itemId = await createTestWorkItem({
        status: "backlog",
        blockedBy: [blockerId],
      });

      await expect(
        workflowEngine.transition(itemId, "ready")
      ).rejects.toThrow("Work item is blocked");
    });
  });

  describe("getValidTransitions", () => {
    it("should return valid transitions from backlog", async () => {
      const itemId = await createTestWorkItem({ status: "backlog" });
      const transitions = await workflowEngine.getValidTransitions(itemId);

      expect(transitions).toContain("ready");
      expect(transitions).toHaveLength(1);
    });

    it("should return valid transitions from ready", async () => {
      const itemId = await createTestWorkItem({ status: "ready" });
      const transitions = await workflowEngine.getValidTransitions(itemId);

      expect(transitions).toContain("in_progress");
      expect(transitions).toContain("backlog");
      expect(transitions).toHaveLength(2);
    });

    it("should return valid transitions from in_progress", async () => {
      const itemId = await createTestWorkItem({ status: "in_progress" });
      const transitions = await workflowEngine.getValidTransitions(itemId);

      expect(transitions).toContain("review");
      expect(transitions).toContain("backlog");
      expect(transitions).toHaveLength(2);
    });

    it("should return valid transitions from review", async () => {
      const itemId = await createTestWorkItem({ status: "review" });
      const transitions = await workflowEngine.getValidTransitions(itemId);

      expect(transitions).toContain("done");
      expect(transitions).toContain("in_progress");
      expect(transitions).toContain("backlog");
      expect(transitions).toHaveLength(3);
    });

    it("should allow transition to backlog from done (for re-opening)", async () => {
      const itemId = await createTestWorkItem({ status: "done" });
      const transitions = await workflowEngine.getValidTransitions(itemId);

      expect(transitions).toContain("backlog");
      expect(transitions).toHaveLength(1);
    });

    it("should filter out blocked transitions", async () => {
      const blockerId = await createTestWorkItem({ status: "backlog" });
      const itemId = await createTestWorkItem({
        status: "backlog",
        blockedBy: [blockerId],
      });

      const transitions = await workflowEngine.getValidTransitions(itemId);
      expect(transitions).toHaveLength(0);
    });
  });

  describe("approval management", () => {
    it("should set approval requirement for a transition", async () => {
      const itemId = await createTestWorkItem({ status: "backlog" });
      await workflowEngine.requireApproval(itemId, "backlog_to_ready", true);

      const required = await workflowEngine.isApprovalRequired(
        itemId,
        "backlog_to_ready"
      );
      expect(required).toBe(true);
    });

    it("should unset approval requirement for a transition", async () => {
      const itemId = await createTestWorkItem({
        status: "backlog",
        requiresApproval: { backlog_to_ready: true },
      });

      await workflowEngine.requireApproval(itemId, "backlog_to_ready", false);

      const required = await workflowEngine.isApprovalRequired(
        itemId,
        "backlog_to_ready"
      );
      expect(required).toBe(false);
    });

    it("should check if approval is required", async () => {
      const itemId = await createTestWorkItem({
        status: "backlog",
        requiresApproval: { backlog_to_ready: true },
      });

      const required = await workflowEngine.isApprovalRequired(
        itemId,
        "backlog_to_ready"
      );
      expect(required).toBe(true);
    });

    it("should return false for approval not required", async () => {
      const itemId = await createTestWorkItem({ status: "backlog" });

      const required = await workflowEngine.isApprovalRequired(
        itemId,
        "backlog_to_ready"
      );
      expect(required).toBe(false);
    });

    it("should record approval for a transition", async () => {
      const itemId = await createTestWorkItem({
        status: "backlog",
        requiresApproval: { backlog_to_ready: true },
      });

      await workflowEngine.approveTransition(
        itemId,
        "backlog_to_ready",
        "approver-1"
      );

      // After approval, transition should succeed
      await workflowEngine.transition(itemId, "ready");
      const item = await workItemRepo.findById(itemId);
      expect(item?.status).toBe("ready");
    });
  });

  describe("findWorkForRole", () => {
    it("should find ready work items for implementer role", async () => {
      await createTestWorkItem({ status: "ready" });
      await createTestWorkItem({ status: "ready" });
      await createTestWorkItem({ status: "backlog" });

      const work = await workflowEngine.findWorkForRole("implementer");
      expect(work.length).toBeGreaterThanOrEqual(2);
      expect(work.every((item) => item.status === "ready")).toBe(true);
    });

    it("should find in_progress items for tester role", async () => {
      await createTestWorkItem({ status: "in_progress" });
      await createTestWorkItem({ status: "in_progress" });

      const work = await workflowEngine.findWorkForRole("tester");
      expect(work.length).toBeGreaterThanOrEqual(2);
      expect(work.every((item) => item.status === "in_progress")).toBe(true);
    });

    it("should find review items for reviewer role", async () => {
      await createTestWorkItem({ status: "review" });
      await createTestWorkItem({ status: "review" });

      const work = await workflowEngine.findWorkForRole("reviewer");
      expect(work.length).toBeGreaterThanOrEqual(2);
      expect(work.every((item) => item.status === "review")).toBe(true);
    });

    it("should find backlog items for refiner role", async () => {
      await createTestWorkItem({ status: "backlog" });
      await createTestWorkItem({ status: "backlog" });

      const work = await workflowEngine.findWorkForRole("refiner");
      expect(work.length).toBeGreaterThanOrEqual(2);
      expect(work.every((item) => item.status === "backlog")).toBe(true);
    });

    it("should exclude blocked items from ready work", async () => {
      const blockerId = await createTestWorkItem({ status: "backlog" });
      await createTestWorkItem({ status: "ready" });
      await createTestWorkItem({ status: "ready", blockedBy: [blockerId] });

      const work = await workflowEngine.findWorkForRole("implementer");
      const blockedItem = work.find((item) => item.blockedBy.length > 0);
      expect(blockedItem).toBeUndefined();
    });
  });

  describe("assignWorkToAgent", () => {
    it("should assign work item to worker and transition to in_progress", async () => {
      const itemId = await createTestWorkItem({ status: "ready" });
      const workerId = await createTestWorker();

      await workflowEngine.assignWorkToAgent(itemId, workerId, "implementer");

      const item = await workItemRepo.findById(itemId);
      const worker = await workerRepo.findById(workerId);

      expect(item?.status).toBe("in_progress");
      expect(item?.assignedAgents.implementer).toBe(workerId);
      expect(worker?.currentWorkItemId).toBe(itemId);
      expect(worker?.currentRole).toBe("implementer");
      expect(worker?.status).toBe("working");
    });

    it("should throw error if work item is not ready", async () => {
      const itemId = await createTestWorkItem({ status: "backlog" });
      const workerId = await createTestWorker();

      await expect(
        workflowEngine.assignWorkToAgent(itemId, workerId, "implementer")
      ).rejects.toThrow("Work item must be in ready status");
    });

    it("should throw error if worker does not exist", async () => {
      const itemId = await createTestWorkItem({ status: "ready" });

      await expect(
        workflowEngine.assignWorkToAgent(
          itemId,
          "non-existent-worker",
          "implementer"
        )
      ).rejects.toThrow("Worker not found");
    });

    it("should allow assigning work to different roles", async () => {
      const itemId = await createTestWorkItem({ status: "ready" });
      const workerId1 = await createTestWorker();
      const workerId2 = await createTestWorker();

      await workflowEngine.assignWorkToAgent(itemId, workerId1, "implementer");

      // Re-assign to a different worker for testing
      const item = await workItemRepo.findById(itemId);
      expect(item?.assignedAgents.implementer).toBe(workerId1);
    });
  });

  describe("completeWork", () => {
    it("should move work item to review and unassign worker", async () => {
      const itemId = await createTestWorkItem({ status: "ready" });
      const workerId = await createTestWorker();

      await workflowEngine.assignWorkToAgent(itemId, workerId, "implementer");
      await workflowEngine.completeWork(itemId, workerId);

      const item = await workItemRepo.findById(itemId);
      const worker = await workerRepo.findById(workerId);

      expect(item?.status).toBe("review");
      expect(worker?.currentWorkItemId).toBeNull();
      expect(worker?.currentRole).toBeNull();
      expect(worker?.status).toBe("idle");
    });

    it("should throw error if worker is not assigned to the work item", async () => {
      const itemId = await createTestWorkItem({ status: "in_progress" });
      const workerId = await createTestWorker();

      await expect(
        workflowEngine.completeWork(itemId, workerId)
      ).rejects.toThrow("Worker is not assigned to this work item");
    });

    it("should throw error if work item is not in progress", async () => {
      const itemId = await createTestWorkItem({ status: "ready" });
      const workerId = await createTestWorker();

      await expect(
        workflowEngine.completeWork(itemId, workerId)
      ).rejects.toThrow("Work item must be in progress");
    });
  });

  describe("getWorkflowState", () => {
    it("should return current state with valid transitions", async () => {
      const itemId = await createTestWorkItem({ status: "ready" });
      const state = await workflowEngine.getWorkflowState(itemId);

      expect(state.currentStatus).toBe("ready");
      expect(state.validTransitions).toContain("in_progress");
      expect(state.validTransitions).toContain("backlog");
      expect(state.isBlocked).toBe(false);
      expect(state.blockers).toEqual([]);
    });

    it("should indicate blocked state", async () => {
      const blockerId = await createTestWorkItem({ status: "backlog" });
      const itemId = await createTestWorkItem({
        status: "backlog",
        blockedBy: [blockerId],
      });

      const state = await workflowEngine.getWorkflowState(itemId);
      expect(state.isBlocked).toBe(true);
      expect(state.blockers).toHaveLength(1);
    });
  });

  describe("getBlockedItems", () => {
    it("should return all blocked work items", async () => {
      const blockerId1 = await createTestWorkItem({ status: "backlog" });
      const blockerId2 = await createTestWorkItem({ status: "in_progress" });

      await createTestWorkItem({ status: "backlog", blockedBy: [blockerId1] });
      await createTestWorkItem({ status: "ready", blockedBy: [blockerId2] });
      await createTestWorkItem({ status: "backlog" }); // Not blocked

      const blocked = await workflowEngine.getBlockedItems();
      expect(blocked.length).toBeGreaterThanOrEqual(2);
      expect(blocked.every((item) => item.blockedBy.length > 0)).toBe(true);
    });

    it("should return empty array if no items are blocked", async () => {
      await createTestWorkItem({ status: "backlog" });
      await createTestWorkItem({ status: "ready" });

      const blocked = await workflowEngine.getBlockedItems();
      expect(blocked).toEqual([]);
    });
  });

  describe("checkDependencies", () => {
    it("should return true if all blockers are resolved (done)", async () => {
      const blockerId1 = await createTestWorkItem({ status: "done" });
      const blockerId2 = await createTestWorkItem({ status: "done" });
      const itemId = await createTestWorkItem({
        status: "backlog",
        blockedBy: [blockerId1, blockerId2],
      });

      const isUnblocked = await workflowEngine.checkDependencies(itemId);
      expect(isUnblocked).toBe(true);
    });

    it("should return false if any blocker is not done", async () => {
      const blockerId1 = await createTestWorkItem({ status: "done" });
      const blockerId2 = await createTestWorkItem({ status: "in_progress" });
      const itemId = await createTestWorkItem({
        status: "backlog",
        blockedBy: [blockerId1, blockerId2],
      });

      const isUnblocked = await workflowEngine.checkDependencies(itemId);
      expect(isUnblocked).toBe(false);
    });

    it("should return true if there are no blockers", async () => {
      const itemId = await createTestWorkItem({ status: "backlog" });

      const isUnblocked = await workflowEngine.checkDependencies(itemId);
      expect(isUnblocked).toBe(true);
    });
  });
});
