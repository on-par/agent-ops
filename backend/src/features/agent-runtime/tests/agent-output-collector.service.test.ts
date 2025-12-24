import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../../db/schema.js";
import { AgentOutputCollectorService } from "../services/agent-output-collector.service.js";
import type {
  NewAgentExecution,
  NewTemplate,
  NewWorker,
  NewWorkItem,
  NewWorkspace,
} from "../../../db/schema.js";
import { v4 as uuidv4 } from "uuid";
import { exec } from "child_process";
import { promisify } from "util";

// Mock child_process exec
vi.mock("child_process", () => ({
  exec: vi.fn(),
}));

const execAsync = promisify(exec);

describe("AgentOutputCollectorService", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: AgentOutputCollectorService;
  let testExecutionId: string;

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

    service = new AgentOutputCollectorService(db);

    // Create test fixtures
    const now = new Date();
    const testTemplateId = uuidv4();
    const testWorkerId = uuidv4();
    const testWorkItemId = uuidv4();
    const testWorkspaceId = uuidv4();
    testExecutionId = uuidv4();

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

    const testExecution: NewAgentExecution = {
      id: testExecutionId,
      workerId: testWorkerId,
      workItemId: testWorkItemId,
      workspaceId: testWorkspaceId,
      templateId: testTemplateId,
      status: "running",
      createdAt: now,
    };

    await db.insert(schema.templates).values(testTemplate);
    await db.insert(schema.workItems).values(testWorkItem);
    await db.insert(schema.workers).values(testWorker);
    await db.insert(schema.workspaces).values(testWorkspace);
    await db.insert(schema.agentExecutions).values(testExecution);
  });

  afterEach(() => {
    sqlite.close();
    vi.clearAllMocks();
  });

  describe("collectDiff", () => {
    it("should collect git diff from workspace", async () => {
      const mockDiff = "diff --git a/file.ts b/file.ts\n+new line";

      vi.mocked(exec).mockImplementation((cmd, options, callback) => {
        if (typeof callback === "function") {
          callback(null, { stdout: mockDiff, stderr: "" } as any);
        }
        return {} as any;
      });

      const diff = await service.collectDiff("/tmp/test-workspace");

      expect(diff).toBe(mockDiff);
    });

    it("should return undefined when no changes exist", async () => {
      vi.mocked(exec).mockImplementation((cmd, options, callback) => {
        if (typeof callback === "function") {
          callback(null, { stdout: "", stderr: "" } as any);
        }
        return {} as any;
      });

      const diff = await service.collectDiff("/tmp/test-workspace");

      expect(diff).toBeUndefined();
    });

    it("should return undefined when git command fails", async () => {
      vi.mocked(exec).mockImplementation((cmd, options, callback) => {
        if (typeof callback === "function") {
          callback(new Error("Not a git repository"), { stdout: "", stderr: "" } as any);
        }
        return {} as any;
      });

      const diff = await service.collectDiff("/tmp/test-workspace");

      expect(diff).toBeUndefined();
    });
  });

  describe("collectArtifacts", () => {
    it("should collect modified files from workspace", async () => {
      const mockFiles = "file1.ts\nfile2.ts\nfile3.ts";

      vi.mocked(exec).mockImplementation((cmd, options, callback) => {
        if (typeof callback === "function") {
          callback(null, { stdout: mockFiles, stderr: "" } as any);
        }
        return {} as any;
      });

      const files = await service.collectArtifacts("/tmp/test-workspace");

      expect(files).toEqual(["file1.ts", "file2.ts", "file3.ts"]);
    });

    it("should return empty array when no files changed", async () => {
      vi.mocked(exec).mockImplementation((cmd, options, callback) => {
        if (typeof callback === "function") {
          callback(null, { stdout: "", stderr: "" } as any);
        }
        return {} as any;
      });

      const files = await service.collectArtifacts("/tmp/test-workspace");

      expect(files).toEqual([]);
    });

    it("should return empty array when git command fails", async () => {
      vi.mocked(exec).mockImplementation((cmd, options, callback) => {
        if (typeof callback === "function") {
          callback(new Error("Not a git repository"), { stdout: "", stderr: "" } as any);
        }
        return {} as any;
      });

      const files = await service.collectArtifacts("/tmp/test-workspace");

      expect(files).toEqual([]);
    });
  });

  describe("collectMetrics", () => {
    it("should calculate metrics with duration", async () => {
      const startTime = new Date(Date.now() - 5000); // 5 seconds ago
      const result = {
        tokensUsed: 1000,
        costUsd: 0.05,
        toolCallsCount: 10,
      };

      const metrics = await service.collectMetrics(startTime, result);

      expect(metrics.tokensUsed).toBe(1000);
      expect(metrics.costUsd).toBe(0.05);
      expect(metrics.toolCallsCount).toBe(10);
      expect(metrics.durationMs).toBeGreaterThanOrEqual(5000);
    });

    it("should use default values for missing metrics", async () => {
      const startTime = new Date();
      const result = {};

      const metrics = await service.collectMetrics(startTime, result);

      expect(metrics.tokensUsed).toBe(0);
      expect(metrics.costUsd).toBe(0);
      expect(metrics.toolCallsCount).toBe(0);
      expect(metrics.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("saveOutput", () => {
    it("should save output and metrics to database", async () => {
      const output = {
        summary: "Task completed successfully",
        filesChanged: ["file1.ts", "file2.ts"],
        diff: "diff content",
        logs: ["log1", "log2"],
        metrics: {
          tokensUsed: 1000,
          costUsd: 0.05,
          toolCallsCount: 10,
          durationMs: 5000,
        },
      };

      await service.saveOutput(testExecutionId, output);

      // Verify the execution was updated
      const [execution] = await db
        .select()
        .from(schema.agentExecutions)
        .where((t) => t.id === testExecutionId);

      expect(execution?.output).toEqual({
        summary: output.summary,
        filesChanged: output.filesChanged,
        diff: output.diff,
        logs: output.logs,
      });
      expect(execution?.tokensUsed).toBe(1000);
      expect(execution?.costUsd).toBe(0.05);
      expect(execution?.toolCallsCount).toBe(10);
      expect(execution?.durationMs).toBe(5000);
    });

    it("should save output without metrics", async () => {
      const output = {
        summary: "Task completed",
        filesChanged: ["file1.ts"],
      };

      await service.saveOutput(testExecutionId, output);

      const [execution] = await db
        .select()
        .from(schema.agentExecutions)
        .where((t) => t.id === testExecutionId);

      expect(execution?.output).toEqual({
        summary: output.summary,
        filesChanged: output.filesChanged,
      });
    });
  });

  describe("collectAll", () => {
    it("should collect all output and save to database", async () => {
      const mockDiff = "diff content";
      const mockFiles = "file1.ts\nfile2.ts";

      vi.mocked(exec).mockImplementation((cmd, options, callback) => {
        if (typeof callback === "function") {
          if (cmd.includes("--name-only")) {
            callback(null, { stdout: mockFiles, stderr: "" } as any);
          } else {
            callback(null, { stdout: mockDiff, stderr: "" } as any);
          }
        }
        return {} as any;
      });

      const startTime = new Date(Date.now() - 5000);
      const result = {
        tokensUsed: 1000,
        costUsd: 0.05,
        toolCallsCount: 10,
      };

      const output = await service.collectAll(
        testExecutionId,
        "/tmp/test-workspace",
        startTime,
        result,
        "Task completed successfully",
        ["log1", "log2"]
      );

      expect(output.summary).toBe("Task completed successfully");
      expect(output.filesChanged).toEqual(["file1.ts", "file2.ts"]);
      expect(output.diff).toBe(mockDiff);
      expect(output.logs).toEqual(["log1", "log2"]);
      expect(output.metrics?.tokensUsed).toBe(1000);
      expect(output.metrics?.costUsd).toBe(0.05);
      expect(output.metrics?.toolCallsCount).toBe(10);
      expect(output.metrics?.durationMs).toBeGreaterThanOrEqual(5000);

      // Verify it was saved to database
      const [execution] = await db
        .select()
        .from(schema.agentExecutions)
        .where((t) => t.id === testExecutionId);

      expect(execution?.output?.summary).toBe("Task completed successfully");
      expect(execution?.tokensUsed).toBe(1000);
    });
  });
});
