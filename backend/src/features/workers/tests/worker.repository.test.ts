import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../../../shared/db/schema.js";
import { WorkerRepository } from "../repositories/worker.repository.js";
import type { NewWorker, NewTemplate } from "../../../shared/db/schema.js";
import { v4 as uuidv4 } from "uuid";

describe("WorkerRepository", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let repository: WorkerRepository;
  let testTemplateId: string;

  beforeEach(async () => {
    // Create in-memory database for testing
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    db = drizzle(sqlite, { schema });

    // Run migrations by creating tables manually (since we don't have migration files in test)
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

  describe("create", () => {
    it("should create a new worker", async () => {
      const newWorker: NewWorker = {
        id: uuidv4(),
        templateId: testTemplateId,
        status: "idle",
        sessionId: uuidv4(),
        spawnedAt: new Date(),
      };

      const worker = await repository.create(newWorker);

      expect(worker).toMatchObject(newWorker);
      expect(worker.tokensUsed).toBe(0);
      expect(worker.costUsd).toBe(0);
      expect(worker.toolCalls).toBe(0);
    });

    it("should create worker with custom metrics", async () => {
      const newWorker: NewWorker = {
        id: uuidv4(),
        templateId: testTemplateId,
        status: "working",
        sessionId: uuidv4(),
        spawnedAt: new Date(),
        tokensUsed: 1000,
        costUsd: 0.05,
        toolCalls: 5,
      };

      const worker = await repository.create(newWorker);

      expect(worker.tokensUsed).toBe(1000);
      expect(worker.costUsd).toBe(0.05);
      expect(worker.toolCalls).toBe(5);
    });
  });

  describe("findById", () => {
    it("should find a worker by id", async () => {
      const newWorker: NewWorker = {
        id: uuidv4(),
        templateId: testTemplateId,
        status: "idle",
        sessionId: uuidv4(),
        spawnedAt: new Date(),
      };

      await repository.create(newWorker);
      const found = await repository.findById(newWorker.id);

      expect(found).toBeTruthy();
      expect(found?.id).toBe(newWorker.id);
    });

    it("should return null for non-existent worker", async () => {
      const found = await repository.findById("non-existent-id");
      expect(found).toBeNull();
    });
  });

  describe("findAll", () => {
    it("should return all workers", async () => {
      const worker1: NewWorker = {
        id: uuidv4(),
        templateId: testTemplateId,
        status: "idle",
        sessionId: uuidv4(),
        spawnedAt: new Date(),
      };

      const worker2: NewWorker = {
        id: uuidv4(),
        templateId: testTemplateId,
        status: "working",
        sessionId: uuidv4(),
        spawnedAt: new Date(),
      };

      await repository.create(worker1);
      await repository.create(worker2);

      const workers = await repository.findAll();

      expect(workers).toHaveLength(2);
      expect(workers.map((w) => w.id)).toContain(worker1.id);
      expect(workers.map((w) => w.id)).toContain(worker2.id);
    });

    it("should return empty array when no workers exist", async () => {
      const workers = await repository.findAll();
      expect(workers).toEqual([]);
    });
  });

  describe("findByStatus", () => {
    it("should find workers by status", async () => {
      const worker1: NewWorker = {
        id: uuidv4(),
        templateId: testTemplateId,
        status: "idle",
        sessionId: uuidv4(),
        spawnedAt: new Date(),
      };

      const worker2: NewWorker = {
        id: uuidv4(),
        templateId: testTemplateId,
        status: "working",
        sessionId: uuidv4(),
        spawnedAt: new Date(),
      };

      const worker3: NewWorker = {
        id: uuidv4(),
        templateId: testTemplateId,
        status: "idle",
        sessionId: uuidv4(),
        spawnedAt: new Date(),
      };

      await repository.create(worker1);
      await repository.create(worker2);
      await repository.create(worker3);

      const idleWorkers = await repository.findByStatus("idle");
      expect(idleWorkers).toHaveLength(2);

      const workingWorkers = await repository.findByStatus("working");
      expect(workingWorkers).toHaveLength(1);
    });
  });

  describe("findByTemplate", () => {
    it("should find workers by template id", async () => {
      const secondTemplateId = uuidv4();
      const now = new Date();

      // Create second template
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

      const worker1: NewWorker = {
        id: uuidv4(),
        templateId: testTemplateId,
        status: "idle",
        sessionId: uuidv4(),
        spawnedAt: new Date(),
      };

      const worker2: NewWorker = {
        id: uuidv4(),
        templateId: secondTemplateId,
        status: "idle",
        sessionId: uuidv4(),
        spawnedAt: new Date(),
      };

      await repository.create(worker1);
      await repository.create(worker2);

      const workersTemplate1 = await repository.findByTemplate(testTemplateId);
      expect(workersTemplate1).toHaveLength(1);
      expect(workersTemplate1[0]?.templateId).toBe(testTemplateId);

      const workersTemplate2 = await repository.findByTemplate(
        secondTemplateId
      );
      expect(workersTemplate2).toHaveLength(1);
      expect(workersTemplate2[0]?.templateId).toBe(secondTemplateId);
    });
  });

  describe("findActive", () => {
    it("should find only idle and working workers", async () => {
      const workers: NewWorker[] = [
        {
          id: uuidv4(),
          templateId: testTemplateId,
          status: "idle",
          sessionId: uuidv4(),
          spawnedAt: new Date(),
        },
        {
          id: uuidv4(),
          templateId: testTemplateId,
          status: "working",
          sessionId: uuidv4(),
          spawnedAt: new Date(),
        },
        {
          id: uuidv4(),
          templateId: testTemplateId,
          status: "paused",
          sessionId: uuidv4(),
          spawnedAt: new Date(),
        },
        {
          id: uuidv4(),
          templateId: testTemplateId,
          status: "error",
          sessionId: uuidv4(),
          spawnedAt: new Date(),
        },
        {
          id: uuidv4(),
          templateId: testTemplateId,
          status: "terminated",
          sessionId: uuidv4(),
          spawnedAt: new Date(),
        },
      ];

      for (const worker of workers) {
        await repository.create(worker);
      }

      const activeWorkers = await repository.findActive();

      expect(activeWorkers).toHaveLength(2);
      expect(activeWorkers.every((w) => ["idle", "working"].includes(w.status))).toBe(true);
    });
  });

  describe("update", () => {
    it("should update worker fields", async () => {
      const newWorker: NewWorker = {
        id: uuidv4(),
        templateId: testTemplateId,
        status: "idle",
        sessionId: uuidv4(),
        spawnedAt: new Date(),
      };

      await repository.create(newWorker);

      const updated = await repository.update(newWorker.id, {
        status: "working",
        currentRole: "implementer",
      });

      expect(updated.status).toBe("working");
      expect(updated.currentRole).toBe("implementer");
    });

    it("should throw error when updating non-existent worker", async () => {
      await expect(
        repository.update("non-existent-id", { status: "working" })
      ).rejects.toThrow("Worker with id non-existent-id not found");
    });
  });

  describe("updateMetrics", () => {
    it("should increment token metrics", async () => {
      const newWorker: NewWorker = {
        id: uuidv4(),
        templateId: testTemplateId,
        status: "idle",
        sessionId: uuidv4(),
        spawnedAt: new Date(),
        tokensUsed: 100,
      };

      await repository.create(newWorker);

      const updated = await repository.updateMetrics(newWorker.id, {
        tokensUsed: 50,
      });

      expect(updated.tokensUsed).toBe(150);
    });

    it("should increment cost metrics", async () => {
      const newWorker: NewWorker = {
        id: uuidv4(),
        templateId: testTemplateId,
        status: "idle",
        sessionId: uuidv4(),
        spawnedAt: new Date(),
        costUsd: 0.05,
      };

      await repository.create(newWorker);

      const updated = await repository.updateMetrics(newWorker.id, {
        costUsd: 0.03,
      });

      expect(updated.costUsd).toBeCloseTo(0.08, 2);
    });

    it("should increment tool call metrics", async () => {
      const newWorker: NewWorker = {
        id: uuidv4(),
        templateId: testTemplateId,
        status: "idle",
        sessionId: uuidv4(),
        spawnedAt: new Date(),
        toolCalls: 5,
      };

      await repository.create(newWorker);

      const updated = await repository.updateMetrics(newWorker.id, {
        toolCalls: 3,
      });

      expect(updated.toolCalls).toBe(8);
    });

    it("should increment multiple metrics at once", async () => {
      const newWorker: NewWorker = {
        id: uuidv4(),
        templateId: testTemplateId,
        status: "idle",
        sessionId: uuidv4(),
        spawnedAt: new Date(),
        tokensUsed: 100,
        costUsd: 0.05,
        toolCalls: 5,
      };

      await repository.create(newWorker);

      const updated = await repository.updateMetrics(newWorker.id, {
        tokensUsed: 50,
        costUsd: 0.03,
        toolCalls: 2,
      });

      expect(updated.tokensUsed).toBe(150);
      expect(updated.costUsd).toBeCloseTo(0.08, 2);
      expect(updated.toolCalls).toBe(7);
    });

    it("should throw error when worker not found", async () => {
      await expect(
        repository.updateMetrics("non-existent-id", { tokensUsed: 50 })
      ).rejects.toThrow("Worker with id non-existent-id not found");
    });
  });

  describe("delete", () => {
    it("should delete a worker", async () => {
      const newWorker: NewWorker = {
        id: uuidv4(),
        templateId: testTemplateId,
        status: "idle",
        sessionId: uuidv4(),
        spawnedAt: new Date(),
      };

      await repository.create(newWorker);
      await repository.delete(newWorker.id);

      const found = await repository.findById(newWorker.id);
      expect(found).toBeNull();
    });

    it("should throw error when deleting non-existent worker", async () => {
      await expect(repository.delete("non-existent-id")).rejects.toThrow(
        "Worker with id non-existent-id not found"
      );
    });
  });
});
