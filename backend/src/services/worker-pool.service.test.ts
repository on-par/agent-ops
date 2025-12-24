import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import { WorkerRepository } from "../repositories/worker.repository.js";
import { WorkerPoolService } from "./worker-pool.service.js";
import type { NewWorker, NewTemplate, AgentRole } from "../db/schema.js";

describe("WorkerPoolService", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let repository: WorkerRepository;
  let service: WorkerPoolService;
  let testTemplateId: string;

  // Helper function to create a work item
  const createWorkItem = async (id?: string) => {
    const workItemId = id || crypto.randomUUID();
    const now = new Date();
    await db.insert(schema.workItems).values({
      id: workItemId,
      title: "Test Work Item",
      type: "task",
      status: "ready",
      description: "A test work item",
      successCriteria: [],
      linkedFiles: [],
      createdBy: "test-user",
      assignedAgents: {},
      requiresApproval: {},
      createdAt: now,
      updatedAt: now,
      childIds: [],
      blockedBy: [],
    });
    return workItemId;
  };

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

    repository = new WorkerRepository(db);
    service = new WorkerPoolService(repository, { maxWorkers: 3 });

    // Create a test template
    testTemplateId = crypto.randomUUID();
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

  describe("spawn", () => {
    it("should spawn a new worker", async () => {
      const sessionId = crypto.randomUUID();
      const worker = await service.spawn(testTemplateId, sessionId);

      expect(worker.templateId).toBe(testTemplateId);
      expect(worker.sessionId).toBe(sessionId);
      expect(worker.status).toBe("idle");
      expect(worker.tokensUsed).toBe(0);
      expect(worker.costUsd).toBe(0);
      expect(worker.toolCalls).toBe(0);
      expect(worker.errors).toBe(0);
      expect(worker.contextWindowLimit).toBe(200000);
    });

    it("should generate unique worker IDs", async () => {
      const sessionId1 = crypto.randomUUID();
      const sessionId2 = crypto.randomUUID();

      const worker1 = await service.spawn(testTemplateId, sessionId1);
      const worker2 = await service.spawn(testTemplateId, sessionId2);

      expect(worker1.id).not.toBe(worker2.id);
    });

    it("should throw error when max workers limit reached", async () => {
      // Spawn 3 workers (max limit)
      await service.spawn(testTemplateId, crypto.randomUUID());
      await service.spawn(testTemplateId, crypto.randomUUID());
      await service.spawn(testTemplateId, crypto.randomUUID());

      // Try to spawn 4th worker
      await expect(
        service.spawn(testTemplateId, crypto.randomUUID())
      ).rejects.toThrow("Cannot spawn worker: maximum worker limit reached");
    });

    it("should allow spawning after terminating a worker", async () => {
      // Spawn 3 workers (max limit)
      const worker1 = await service.spawn(testTemplateId, crypto.randomUUID());
      await service.spawn(testTemplateId, crypto.randomUUID());
      await service.spawn(testTemplateId, crypto.randomUUID());

      // Terminate one worker
      await service.terminate(worker1.id);

      // Should be able to spawn another
      const newWorker = await service.spawn(
        testTemplateId,
        crypto.randomUUID()
      );
      expect(newWorker).toBeDefined();
    });

    it("should throw error when templateId is missing", async () => {
      await expect(
        service.spawn("", crypto.randomUUID())
      ).rejects.toThrow("Template ID and session ID are required");
    });

    it("should throw error when sessionId is missing", async () => {
      await expect(service.spawn(testTemplateId, "")).rejects.toThrow(
        "Template ID and session ID are required"
      );
    });
  });

  describe("terminate", () => {
    it("should terminate a worker", async () => {
      const worker = await service.spawn(testTemplateId, crypto.randomUUID());
      const terminated = await service.terminate(worker.id);

      expect(terminated.status).toBe("terminated");
      expect(terminated.currentWorkItemId).toBeNull();
      expect(terminated.currentRole).toBeNull();
    });

    it("should clear work assignment when terminating", async () => {
      const worker = await service.spawn(testTemplateId, crypto.randomUUID());
      const workItemId = await createWorkItem();

      // Assign work
      await service.assignWork(worker.id, workItemId, "implementer");

      // Terminate
      const terminated = await service.terminate(worker.id);

      expect(terminated.currentWorkItemId).toBeNull();
      expect(terminated.currentRole).toBeNull();
    });

    it("should throw error when worker not found", async () => {
      await expect(service.terminate("non-existent-id")).rejects.toThrow(
        "Worker with id non-existent-id not found"
      );
    });
  });

  describe("pause", () => {
    it("should pause a working worker", async () => {
      const worker = await service.spawn(testTemplateId, crypto.randomUUID());
      const workItemId = await createWorkItem();

      // Assign work to make it "working"
      await service.assignWork(worker.id, workItemId, "implementer");

      // Pause
      const paused = await service.pause(worker.id);
      expect(paused.status).toBe("paused");
    });

    it("should throw error when pausing non-working worker", async () => {
      const worker = await service.spawn(testTemplateId, crypto.randomUUID());

      await expect(service.pause(worker.id)).rejects.toThrow(
        `Cannot pause worker ${worker.id}: worker is not in working status`
      );
    });

    it("should throw error when worker not found", async () => {
      await expect(service.pause("non-existent-id")).rejects.toThrow(
        "Worker with id non-existent-id not found"
      );
    });
  });

  describe("resume", () => {
    it("should resume a paused worker to working status", async () => {
      const worker = await service.spawn(testTemplateId, crypto.randomUUID());
      const workItemId = await createWorkItem();

      // Assign work and pause
      await service.assignWork(worker.id, workItemId, "implementer");
      await service.pause(worker.id);

      // Resume
      const resumed = await service.resume(worker.id);
      expect(resumed.status).toBe("working");
    });

    it("should resume paused worker to idle if no current work", async () => {
      const worker = await service.spawn(testTemplateId, crypto.randomUUID());

      // Manually set to paused without work
      await repository.update(worker.id, { status: "paused" });

      // Resume
      const resumed = await service.resume(worker.id);
      expect(resumed.status).toBe("idle");
    });

    it("should throw error when resuming non-paused worker", async () => {
      const worker = await service.spawn(testTemplateId, crypto.randomUUID());

      await expect(service.resume(worker.id)).rejects.toThrow(
        `Cannot resume worker ${worker.id}: worker is not in paused status`
      );
    });

    it("should throw error when worker not found", async () => {
      await expect(service.resume("non-existent-id")).rejects.toThrow(
        "Worker with id non-existent-id not found"
      );
    });
  });

  describe("assignWork", () => {
    it("should assign work to idle worker", async () => {
      const worker = await service.spawn(testTemplateId, crypto.randomUUID());
      const workItemId = await createWorkItem();
      const role: AgentRole = "implementer";

      const assigned = await service.assignWork(worker.id, workItemId, role);

      expect(assigned.currentWorkItemId).toBe(workItemId);
      expect(assigned.currentRole).toBe(role);
      expect(assigned.status).toBe("working");
    });

    it("should work with different agent roles", async () => {
      const roles: AgentRole[] = [
        "refiner",
        "implementer",
        "tester",
      ];

      for (const role of roles) {
        const worker = await service.spawn(
          testTemplateId,
          crypto.randomUUID()
        );
        const workItemId = await createWorkItem();

        const assigned = await service.assignWork(worker.id, workItemId, role);
        expect(assigned.currentRole).toBe(role);
      }
    });

    it("should throw error when assigning to non-idle worker", async () => {
      const worker = await service.spawn(testTemplateId, crypto.randomUUID());
      const workItemId1 = await createWorkItem();
      const workItemId2 = await createWorkItem();

      // Assign first work item
      await service.assignWork(worker.id, workItemId1, "implementer");

      // Try to assign second work item
      await expect(
        service.assignWork(worker.id, workItemId2, "tester")
      ).rejects.toThrow(
        `Cannot assign work to worker ${worker.id}: worker is not idle`
      );
    });

    it("should throw error when worker not found", async () => {
      await expect(
        service.assignWork("non-existent-id", "work-123", "implementer")
      ).rejects.toThrow("Worker with id non-existent-id not found");
    });
  });

  describe("completeWork", () => {
    it("should complete work and set worker to idle", async () => {
      const worker = await service.spawn(testTemplateId, crypto.randomUUID());
      const workItemId = await createWorkItem();

      // Assign and complete work
      await service.assignWork(worker.id, workItemId, "implementer");
      const completed = await service.completeWork(worker.id);

      expect(completed.status).toBe("idle");
      expect(completed.currentWorkItemId).toBeNull();
      expect(completed.currentRole).toBeNull();
    });

    it("should work even if worker has no current work", async () => {
      const worker = await service.spawn(testTemplateId, crypto.randomUUID());
      const completed = await service.completeWork(worker.id);

      expect(completed.status).toBe("idle");
    });

    it("should throw error when worker not found", async () => {
      await expect(service.completeWork("non-existent-id")).rejects.toThrow(
        "Worker with id non-existent-id not found"
      );
    });
  });

  describe("getPool", () => {
    it("should return empty pool when no workers", async () => {
      const pool = await service.getPool();

      expect(pool.totalWorkers).toBe(0);
      expect(pool.activeWorkers).toBe(0);
      expect(pool.idleWorkers).toBe(0);
      expect(pool.totalCostUsd).toBe(0);
      expect(pool.totalTokensUsed).toBe(0);
      expect(pool.totalToolCalls).toBe(0);
      expect(pool.workers).toEqual([]);
    });

    it("should return correct pool summary", async () => {
      // Create workers with different states
      const worker1 = await service.spawn(testTemplateId, crypto.randomUUID());
      const worker2 = await service.spawn(testTemplateId, crypto.randomUUID());
      const worker3 = await service.spawn(testTemplateId, crypto.randomUUID());

      // Assign work to worker2
      const workItemId = await createWorkItem();
      await service.assignWork(worker2.id, workItemId, "implementer");

      const pool = await service.getPool();

      expect(pool.totalWorkers).toBe(3);
      expect(pool.activeWorkers).toBe(3); // idle + working
      expect(pool.idleWorkers).toBe(2); // worker1 and worker3
    });

    it("should calculate aggregate metrics correctly", async () => {
      const worker1 = await service.spawn(testTemplateId, crypto.randomUUID());
      const worker2 = await service.spawn(testTemplateId, crypto.randomUUID());

      // Update metrics
      await service.updateMetrics(worker1.id, {
        tokensUsed: 1000,
        costUsd: 0.05,
        toolCalls: 5,
      });

      await service.updateMetrics(worker2.id, {
        tokensUsed: 2000,
        costUsd: 0.1,
        toolCalls: 10,
      });

      const pool = await service.getPool();

      expect(pool.totalTokensUsed).toBe(3000);
      expect(pool.totalCostUsd).toBeCloseTo(0.15, 2);
      expect(pool.totalToolCalls).toBe(15);
    });

    it("should not count terminated workers as active", async () => {
      const worker1 = await service.spawn(testTemplateId, crypto.randomUUID());
      const worker2 = await service.spawn(testTemplateId, crypto.randomUUID());

      await service.terminate(worker1.id);

      const pool = await service.getPool();

      expect(pool.totalWorkers).toBe(2);
      expect(pool.activeWorkers).toBe(1); // Only worker2
      expect(pool.idleWorkers).toBe(1);
    });
  });

  describe("getAvailableWorkers", () => {
    it("should return only idle workers", async () => {
      const worker1 = await service.spawn(testTemplateId, crypto.randomUUID());
      const worker2 = await service.spawn(testTemplateId, crypto.randomUUID());

      // Assign work to worker2
      const workItemId = await createWorkItem();
      await service.assignWork(worker2.id, workItemId, "implementer");

      const available = await service.getAvailableWorkers();

      expect(available).toHaveLength(1);
      expect(available[0]?.id).toBe(worker1.id);
      expect(available[0]?.status).toBe("idle");
    });

    it("should return empty array when no idle workers", async () => {
      const worker = await service.spawn(testTemplateId, crypto.randomUUID());
      const workItemId = await createWorkItem();
      await service.assignWork(worker.id, workItemId, "implementer");

      const available = await service.getAvailableWorkers();
      expect(available).toEqual([]);
    });
  });

  describe("getWorkersByTemplate", () => {
    it("should return workers for specific template", async () => {
      // Create second template
      const secondTemplateId = crypto.randomUUID();
      const now = new Date();
      await db.insert(schema.templates).values({
        id: secondTemplateId,
        name: "Second Template",
        description: "Another template",
        createdBy: "system",
        systemPrompt: "You are another test agent",
        permissionMode: "askUser",
        maxTurns: 100,
        builtinTools: [],
        mcpServers: [],
        allowedWorkItemTypes: ["*"],
        createdAt: now,
        updatedAt: now,
      });

      // Create workers with different templates
      const worker1 = await service.spawn(testTemplateId, crypto.randomUUID());
      await service.spawn(secondTemplateId, crypto.randomUUID());

      const workers = await service.getWorkersByTemplate(testTemplateId);

      expect(workers).toHaveLength(1);
      expect(workers[0]?.id).toBe(worker1.id);
      expect(workers[0]?.templateId).toBe(testTemplateId);
    });
  });

  describe("updateMetrics", () => {
    it("should update token metrics", async () => {
      const worker = await service.spawn(testTemplateId, crypto.randomUUID());

      const updated = await service.updateMetrics(worker.id, {
        tokensUsed: 1000,
      });

      expect(updated.tokensUsed).toBe(1000);
    });

    it("should update cost metrics", async () => {
      const worker = await service.spawn(testTemplateId, crypto.randomUUID());

      const updated = await service.updateMetrics(worker.id, {
        costUsd: 0.05,
      });

      expect(updated.costUsd).toBeCloseTo(0.05, 2);
    });

    it("should update tool call metrics", async () => {
      const worker = await service.spawn(testTemplateId, crypto.randomUUID());

      const updated = await service.updateMetrics(worker.id, {
        toolCalls: 5,
      });

      expect(updated.toolCalls).toBe(5);
    });

    it("should update context window usage", async () => {
      const worker = await service.spawn(testTemplateId, crypto.randomUUID());

      const updated = await service.updateMetrics(worker.id, {
        contextWindowUsed: 50000,
      });

      expect(updated.contextWindowUsed).toBe(50000);
    });

    it("should update multiple metrics at once", async () => {
      const worker = await service.spawn(testTemplateId, crypto.randomUUID());

      const updated = await service.updateMetrics(worker.id, {
        tokensUsed: 1000,
        costUsd: 0.05,
        toolCalls: 5,
        contextWindowUsed: 50000,
      });

      expect(updated.tokensUsed).toBe(1000);
      expect(updated.costUsd).toBeCloseTo(0.05, 2);
      expect(updated.toolCalls).toBe(5);
      expect(updated.contextWindowUsed).toBe(50000);
    });

    it("should increment metrics on subsequent updates", async () => {
      const worker = await service.spawn(testTemplateId, crypto.randomUUID());

      await service.updateMetrics(worker.id, {
        tokensUsed: 1000,
        costUsd: 0.05,
      });

      const updated = await service.updateMetrics(worker.id, {
        tokensUsed: 500,
        costUsd: 0.03,
      });

      expect(updated.tokensUsed).toBe(1500);
      expect(updated.costUsd).toBeCloseTo(0.08, 2);
    });

    it("should throw error when worker not found", async () => {
      await expect(
        service.updateMetrics("non-existent-id", { tokensUsed: 1000 })
      ).rejects.toThrow("Worker with id non-existent-id not found");
    });
  });

  describe("setMaxWorkers and getMaxWorkers", () => {
    it("should update max workers limit", () => {
      service.setMaxWorkers(10);
      expect(service.getMaxWorkers()).toBe(10);
    });

    it("should throw error for non-positive limit", () => {
      expect(() => service.setMaxWorkers(0)).toThrow(
        "Maximum workers limit must be positive"
      );
      expect(() => service.setMaxWorkers(-1)).toThrow(
        "Maximum workers limit must be positive"
      );
    });

    it("should affect spawn behavior", async () => {
      service.setMaxWorkers(1);

      await service.spawn(testTemplateId, crypto.randomUUID());

      await expect(
        service.spawn(testTemplateId, crypto.randomUUID())
      ).rejects.toThrow("maximum worker limit reached");
    });
  });

  describe("canSpawnMore", () => {
    it("should return true when under limit", async () => {
      const canSpawn = await service.canSpawnMore();
      expect(canSpawn).toBe(true);
    });

    it("should return false when at limit", async () => {
      // Spawn 3 workers (max limit)
      await service.spawn(testTemplateId, crypto.randomUUID());
      await service.spawn(testTemplateId, crypto.randomUUID());
      await service.spawn(testTemplateId, crypto.randomUUID());

      const canSpawn = await service.canSpawnMore();
      expect(canSpawn).toBe(false);
    });

    it("should return true after terminating a worker", async () => {
      // Spawn 3 workers (max limit)
      const worker1 = await service.spawn(testTemplateId, crypto.randomUUID());
      await service.spawn(testTemplateId, crypto.randomUUID());
      await service.spawn(testTemplateId, crypto.randomUUID());

      await service.terminate(worker1.id);

      const canSpawn = await service.canSpawnMore();
      expect(canSpawn).toBe(true);
    });

    it("should not count paused/error workers against limit", async () => {
      const worker1 = await service.spawn(testTemplateId, crypto.randomUUID());
      const worker2 = await service.spawn(testTemplateId, crypto.randomUUID());

      // Manually set worker1 to error status
      await repository.update(worker1.id, { status: "error" });

      // Should be able to spawn 2 more (only worker2 counts as active)
      const canSpawn = await service.canSpawnMore();
      expect(canSpawn).toBe(true);

      await service.spawn(testTemplateId, crypto.randomUUID());
      await service.spawn(testTemplateId, crypto.randomUUID());

      const canSpawnNow = await service.canSpawnMore();
      expect(canSpawnNow).toBe(false);
    });
  });

  describe("reportError", () => {
    it("should set worker to error status", async () => {
      const worker = await service.spawn(testTemplateId, crypto.randomUUID());

      const errorWorker = await service.reportError(
        worker.id,
        "Test error message"
      );

      expect(errorWorker.status).toBe("error");
      expect(errorWorker.errors).toBe(1);
    });

    it("should increment error count", async () => {
      const worker = await service.spawn(testTemplateId, crypto.randomUUID());

      await service.reportError(worker.id, "First error");
      const secondError = await service.reportError(worker.id, "Second error");

      expect(secondError.errors).toBe(2);
    });

    it("should throw error when worker not found", async () => {
      await expect(
        service.reportError("non-existent-id", "Error message")
      ).rejects.toThrow("Worker with id non-existent-id not found");
    });
  });

  describe("configuration", () => {
    it("should initialize with default max workers", () => {
      const defaultService = new WorkerPoolService(repository);
      expect(defaultService.getMaxWorkers()).toBe(10);
    });

    it("should initialize with custom max workers", () => {
      const customService = new WorkerPoolService(repository, {
        maxWorkers: 5,
      });
      expect(customService.getMaxWorkers()).toBe(5);
    });
  });
});
