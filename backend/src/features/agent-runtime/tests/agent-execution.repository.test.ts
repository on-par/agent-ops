import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../../db/schema.js";
import { AgentExecutionRepository } from "../repositories/agent-execution.repository.js";
import type {
  NewAgentExecution,
  NewTemplate,
  NewWorker,
  NewWorkItem,
  NewWorkspace,
} from "../../../db/schema.js";
import { v4 as uuidv4 } from "uuid";

describe("AgentExecutionRepository", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let repository: AgentExecutionRepository;
  let testTemplateId: string;
  let testWorkerId: string;
  let testWorkItemId: string;
  let testWorkspaceId: string;

  beforeEach(async () => {
    // Create in-memory database for testing
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    db = drizzle(sqlite, { schema });

    // Create tables
    sqlite.exec(`
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
        worker_id TEXT,
        work_item_id TEXT,
        repository_id TEXT,
        path TEXT NOT NULL,
        branch_name TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        cleanup_at INTEGER,
        FOREIGN KEY (worker_id) REFERENCES workers(id),
        FOREIGN KEY (work_item_id) REFERENCES work_items(id)
      );

      CREATE TABLE IF NOT EXISTS agent_executions (
        id TEXT PRIMARY KEY,
        worker_id TEXT,
        work_item_id TEXT,
        workspace_id TEXT,
        template_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        error_message TEXT,
        output TEXT,
        duration_ms INTEGER,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        tool_calls_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        FOREIGN KEY (worker_id) REFERENCES workers(id),
        FOREIGN KEY (work_item_id) REFERENCES work_items(id),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY (template_id) REFERENCES templates(id)
      );
    `);

    repository = new AgentExecutionRepository(db);

    // Create test fixtures
    const now = new Date();
    testTemplateId = uuidv4();
    testWorkerId = uuidv4();
    testWorkItemId = uuidv4();
    testWorkspaceId = uuidv4();

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

    const testWorkItem: NewWorkItem = {
      id: testWorkItemId,
      title: "Test Work Item",
      type: "task",
      status: "ready",
      description: "A test work item",
      createdBy: "system",
      createdAt: now,
      updatedAt: now,
    };

    const testWorker: NewWorker = {
      id: testWorkerId,
      templateId: testTemplateId,
      status: "idle",
      sessionId: uuidv4(),
      spawnedAt: now,
    };

    const testWorkspace: NewWorkspace = {
      id: testWorkspaceId,
      workerId: testWorkerId,
      workItemId: testWorkItemId,
      path: "/tmp/test-workspace",
      status: "active",
      createdAt: now,
    };

    await db.insert(schema.templates).values(testTemplate);
    await db.insert(schema.workItems).values(testWorkItem);
    await db.insert(schema.workers).values(testWorker);
    await db.insert(schema.workspaces).values(testWorkspace);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("create", () => {
    it("should create a new agent execution", async () => {
      const newExecution: NewAgentExecution = {
        id: uuidv4(),
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        workspaceId: testWorkspaceId,
        templateId: testTemplateId,
        status: "pending",
        createdAt: new Date(),
      };

      const execution = await repository.create(newExecution);

      expect(execution).toMatchObject(newExecution);
      expect(execution.tokensUsed).toBe(0);
      expect(execution.costUsd).toBe(0);
      expect(execution.toolCallsCount).toBe(0);
    });

    it("should create execution with custom metrics", async () => {
      const newExecution: NewAgentExecution = {
        id: uuidv4(),
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        workspaceId: testWorkspaceId,
        templateId: testTemplateId,
        status: "running",
        tokensUsed: 1000,
        costUsd: 0.05,
        toolCallsCount: 5,
        createdAt: new Date(),
      };

      const execution = await repository.create(newExecution);

      expect(execution.tokensUsed).toBe(1000);
      expect(execution.costUsd).toBe(0.05);
      expect(execution.toolCallsCount).toBe(5);
    });
  });

  describe("findById", () => {
    it("should find an execution by id", async () => {
      const newExecution: NewAgentExecution = {
        id: uuidv4(),
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        workspaceId: testWorkspaceId,
        templateId: testTemplateId,
        status: "pending",
        createdAt: new Date(),
      };

      await repository.create(newExecution);
      const found = await repository.findById(newExecution.id);

      expect(found).toBeTruthy();
      expect(found?.id).toBe(newExecution.id);
    });

    it("should return null for non-existent execution", async () => {
      const found = await repository.findById("non-existent-id");
      expect(found).toBeNull();
    });
  });

  describe("findByWorkerId", () => {
    it("should find all executions for a worker", async () => {
      const execution1: NewAgentExecution = {
        id: uuidv4(),
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        workspaceId: testWorkspaceId,
        templateId: testTemplateId,
        status: "pending",
        createdAt: new Date(),
      };

      const execution2: NewAgentExecution = {
        id: uuidv4(),
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        workspaceId: testWorkspaceId,
        templateId: testTemplateId,
        status: "running",
        createdAt: new Date(),
      };

      await repository.create(execution1);
      await repository.create(execution2);

      const executions = await repository.findByWorkerId(testWorkerId);

      expect(executions).toHaveLength(2);
      expect(executions.map((e) => e.id)).toContain(execution1.id);
      expect(executions.map((e) => e.id)).toContain(execution2.id);
    });

    it("should return empty array when no executions exist", async () => {
      const executions = await repository.findByWorkerId("non-existent-worker");
      expect(executions).toEqual([]);
    });
  });

  describe("findByWorkItemId", () => {
    it("should find all executions for a work item", async () => {
      const execution1: NewAgentExecution = {
        id: uuidv4(),
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        workspaceId: testWorkspaceId,
        templateId: testTemplateId,
        status: "pending",
        createdAt: new Date(),
      };

      const execution2: NewAgentExecution = {
        id: uuidv4(),
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        workspaceId: testWorkspaceId,
        templateId: testTemplateId,
        status: "success",
        createdAt: new Date(),
      };

      await repository.create(execution1);
      await repository.create(execution2);

      const executions = await repository.findByWorkItemId(testWorkItemId);

      expect(executions).toHaveLength(2);
      expect(executions.map((e) => e.id)).toContain(execution1.id);
      expect(executions.map((e) => e.id)).toContain(execution2.id);
    });
  });

  describe("update", () => {
    it("should update execution fields", async () => {
      const newExecution: NewAgentExecution = {
        id: uuidv4(),
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        workspaceId: testWorkspaceId,
        templateId: testTemplateId,
        status: "pending",
        createdAt: new Date(),
      };

      await repository.create(newExecution);

      const updated = await repository.update(newExecution.id, {
        status: "running",
        tokensUsed: 100,
      });

      expect(updated.status).toBe("running");
      expect(updated.tokensUsed).toBe(100);
    });

    it("should throw error when updating non-existent execution", async () => {
      await expect(
        repository.update("non-existent-id", { status: "running" })
      ).rejects.toThrow("Agent execution with id non-existent-id not found");
    });
  });

  describe("updateStatus", () => {
    it("should set startedAt when status changes to running", async () => {
      const newExecution: NewAgentExecution = {
        id: uuidv4(),
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        workspaceId: testWorkspaceId,
        templateId: testTemplateId,
        status: "pending",
        createdAt: new Date(),
      };

      await repository.create(newExecution);

      const updated = await repository.updateStatus(newExecution.id, "running");

      expect(updated.status).toBe("running");
      expect(updated.startedAt).toBeInstanceOf(Date);
    });

    it("should set completedAt and durationMs when status changes to success", async () => {
      const startTime = new Date();
      const newExecution: NewAgentExecution = {
        id: uuidv4(),
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        workspaceId: testWorkspaceId,
        templateId: testTemplateId,
        status: "running",
        createdAt: startTime,
        startedAt: startTime,
      };

      await repository.create(newExecution);

      // Wait a bit to ensure duration is non-zero
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await repository.updateStatus(newExecution.id, "success");

      expect(updated.status).toBe("success");
      expect(updated.completedAt).toBeInstanceOf(Date);
      expect(updated.durationMs).toBeGreaterThan(0);
    });

    it("should set startedAt if not set when transitioning to terminal status", async () => {
      const newExecution: NewAgentExecution = {
        id: uuidv4(),
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        workspaceId: testWorkspaceId,
        templateId: testTemplateId,
        status: "pending",
        createdAt: new Date(),
      };

      await repository.create(newExecution);

      const updated = await repository.updateStatus(newExecution.id, "error");

      expect(updated.status).toBe("error");
      expect(updated.startedAt).toBeInstanceOf(Date);
      expect(updated.completedAt).toBeInstanceOf(Date);
    });

    it("should handle cancelled status", async () => {
      const newExecution: NewAgentExecution = {
        id: uuidv4(),
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        workspaceId: testWorkspaceId,
        templateId: testTemplateId,
        status: "running",
        createdAt: new Date(),
        startedAt: new Date(),
      };

      await repository.create(newExecution);

      const updated = await repository.updateStatus(
        newExecution.id,
        "cancelled"
      );

      expect(updated.status).toBe("cancelled");
      expect(updated.completedAt).toBeInstanceOf(Date);
    });
  });

  describe("setOutput", () => {
    it("should set execution output", async () => {
      const newExecution: NewAgentExecution = {
        id: uuidv4(),
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        workspaceId: testWorkspaceId,
        templateId: testTemplateId,
        status: "running",
        createdAt: new Date(),
      };

      await repository.create(newExecution);

      const output = {
        summary: "Task completed successfully",
        filesChanged: ["file1.ts", "file2.ts"],
        testsRun: true,
        testsPassed: true,
        logs: ["log1", "log2"],
      };

      const updated = await repository.setOutput(newExecution.id, output);

      expect(updated.output).toEqual(output);
    });
  });

  describe("updateMetrics", () => {
    it("should update tokens used", async () => {
      const newExecution: NewAgentExecution = {
        id: uuidv4(),
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        workspaceId: testWorkspaceId,
        templateId: testTemplateId,
        status: "running",
        createdAt: new Date(),
        tokensUsed: 100,
      };

      await repository.create(newExecution);

      const updated = await repository.updateMetrics(newExecution.id, {
        tokensUsed: 250,
      });

      expect(updated.tokensUsed).toBe(250);
    });

    it("should update cost", async () => {
      const newExecution: NewAgentExecution = {
        id: uuidv4(),
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        workspaceId: testWorkspaceId,
        templateId: testTemplateId,
        status: "running",
        createdAt: new Date(),
        costUsd: 0.01,
      };

      await repository.create(newExecution);

      const updated = await repository.updateMetrics(newExecution.id, {
        costUsd: 0.05,
      });

      expect(updated.costUsd).toBeCloseTo(0.05, 2);
    });

    it("should update tool calls count", async () => {
      const newExecution: NewAgentExecution = {
        id: uuidv4(),
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        workspaceId: testWorkspaceId,
        templateId: testTemplateId,
        status: "running",
        createdAt: new Date(),
        toolCallsCount: 5,
      };

      await repository.create(newExecution);

      const updated = await repository.updateMetrics(newExecution.id, {
        toolCallsCount: 10,
      });

      expect(updated.toolCallsCount).toBe(10);
    });

    it("should update multiple metrics at once", async () => {
      const newExecution: NewAgentExecution = {
        id: uuidv4(),
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        workspaceId: testWorkspaceId,
        templateId: testTemplateId,
        status: "running",
        createdAt: new Date(),
      };

      await repository.create(newExecution);

      const updated = await repository.updateMetrics(newExecution.id, {
        tokensUsed: 500,
        costUsd: 0.08,
        toolCallsCount: 12,
      });

      expect(updated.tokensUsed).toBe(500);
      expect(updated.costUsd).toBeCloseTo(0.08, 2);
      expect(updated.toolCallsCount).toBe(12);
    });
  });
});
