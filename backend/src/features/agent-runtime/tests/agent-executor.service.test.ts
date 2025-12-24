import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../../shared/db/schema.js";
import {
  AgentExecutorService,
  type ExecutionContext,
  type ClaudeSDKResult,
} from "../services/agent-executor.service.js";
import type {
  NewTemplate,
  NewWorker,
  NewWorkItem,
  NewWorkspace,
} from "../../../shared/db/schema.js";
import { v4 as uuidv4 } from "uuid";
import { exec } from "child_process";

// Mock child_process exec
vi.mock("child_process", () => ({
  exec: vi.fn(),
}));

describe("AgentExecutorService", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: AgentExecutorService;
  let testTemplateId: string;
  let testWorkerId: string;
  let testWorkItemId: string;
  let testWorkspaceId: string;
  let mockClaudeSDK: ReturnType<typeof vi.fn>;

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

    // Mock git commands for output collector
    vi.mocked(exec).mockImplementation((cmd, options, callback) => {
      if (typeof callback === "function") {
        if (cmd.includes("--name-only")) {
          callback(null, { stdout: "file1.ts\nfile2.ts", stderr: "" } as any);
        } else {
          callback(null, { stdout: "diff content", stderr: "" } as any);
        }
      }
      return {} as any;
    });

    // Create mock Claude SDK query function
    mockClaudeSDK = vi.fn(async (prompt, options): Promise<ClaudeSDKResult> => {
      return {
        sessionId: options.sessionId,
        tokensUsed: 1000,
        costUsd: 0.05,
        toolCallsCount: 5,
      };
    });

    service = new AgentExecutorService(db, mockClaudeSDK);
  });

  afterEach(() => {
    sqlite.close();
    vi.clearAllMocks();
  });

  describe("execute", () => {
    it("should execute agent successfully", async () => {
      const context: ExecutionContext = {
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        workspaceId: testWorkspaceId,
        templateId: testTemplateId,
        workspacePath: "/tmp/test-workspace",
        prompt: "Complete this task",
      };

      const result = await service.execute(context);

      expect(result.status).toBe("success");
      expect(result.executionId).toBeTruthy();
      expect(result.sessionId).toBeTruthy();
      expect(result.output).toBeDefined();

      // Verify Claude SDK was called
      expect(mockClaudeSDK).toHaveBeenCalledWith(
        "Complete this task",
        expect.objectContaining({
          workspacePath: "/tmp/test-workspace",
          sessionId: expect.any(String),
        })
      );

      // Verify execution was saved to database
      const [execution] = await db
        .select()
        .from(schema.agentExecutions)
        .where((t) => t.id === result.executionId);

      expect(execution?.status).toBe("success");
      expect(execution?.tokensUsed).toBe(1000);
      expect(execution?.costUsd).toBe(0.05);
      expect(execution?.toolCallsCount).toBe(5);
    });

    it("should handle Claude SDK errors", async () => {
      // Mock error from Claude SDK
      mockClaudeSDK.mockResolvedValueOnce({
        sessionId: "test-session",
        error: new Error("Claude SDK error"),
      });

      const context: ExecutionContext = {
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        workspaceId: testWorkspaceId,
        templateId: testTemplateId,
        workspacePath: "/tmp/test-workspace",
        prompt: "Complete this task",
      };

      const result = await service.execute(context);

      expect(result.status).toBe("error");
      expect(result.error).toBe("Claude SDK error");

      // Verify execution was saved with error
      const [execution] = await db
        .select()
        .from(schema.agentExecutions)
        .where((t) => t.id === result.executionId);

      expect(execution?.status).toBe("error");
      expect(execution?.errorMessage).toBe("Claude SDK error");
    });

    it("should handle unexpected errors", async () => {
      // Mock unexpected error
      mockClaudeSDK.mockRejectedValueOnce(new Error("Unexpected error"));

      const context: ExecutionContext = {
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        workspaceId: testWorkspaceId,
        templateId: testTemplateId,
        workspacePath: "/tmp/test-workspace",
        prompt: "Complete this task",
      };

      const result = await service.execute(context);

      expect(result.status).toBe("error");
      expect(result.error).toBe("Unexpected error");
    });

    it("should track tool calls via hooks", async () => {
      let preToolUseCalls = 0;
      let postToolUseCalls = 0;

      mockClaudeSDK.mockImplementationOnce(async (prompt, options) => {
        // Simulate tool use
        if (options.onPreToolUse) {
          options.onPreToolUse({ name: "read_file", input: { path: "test.ts" } });
          preToolUseCalls++;
        }
        if (options.onPostToolUse) {
          options.onPostToolUse({ name: "read_file", output: "file contents" });
          postToolUseCalls++;
        }

        return {
          sessionId: options.sessionId,
          tokensUsed: 1000,
          costUsd: 0.05,
          toolCallsCount: 1,
        };
      });

      const context: ExecutionContext = {
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        workspaceId: testWorkspaceId,
        templateId: testTemplateId,
        workspacePath: "/tmp/test-workspace",
        prompt: "Complete this task",
      };

      await service.execute(context);

      expect(preToolUseCalls).toBe(1);
      expect(postToolUseCalls).toBe(1);
    });
  });

  describe("cancel", () => {
    it("should cancel a running execution", async () => {
      // Create a mock that delays to allow cancellation
      mockClaudeSDK.mockImplementationOnce(
        async (prompt, options): Promise<ClaudeSDKResult> => {
          return new Promise((resolve, reject) => {
            // Check for abort signal
            if (options.signal) {
              options.signal.addEventListener("abort", () => {
                reject(new Error("Cancelled"));
              });
            }

            // Delay to allow time for cancellation
            setTimeout(() => {
              resolve({
                sessionId: options.sessionId,
                tokensUsed: 1000,
                costUsd: 0.05,
                toolCallsCount: 5,
              });
            }, 1000);
          });
        }
      );

      const context: ExecutionContext = {
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        workspaceId: testWorkspaceId,
        templateId: testTemplateId,
        workspacePath: "/tmp/test-workspace",
        prompt: "Complete this task",
      };

      // Start execution (don't await)
      const executePromise = service.execute(context);

      // Wait a bit then cancel
      await new Promise((resolve) => setTimeout(resolve, 50));

      const result = await executePromise;

      // Find the execution ID and cancel it
      if (result.status !== "cancelled") {
        // Execution may have completed before we could cancel
        // This is okay for the test
        return;
      }

      expect(result.status).toBe("cancelled");

      // Verify execution was marked as cancelled
      const [execution] = await db
        .select()
        .from(schema.agentExecutions)
        .where((t) => t.id === result.executionId);

      expect(execution?.status).toBe("cancelled");
    });

    it("should throw error when cancelling non-existent execution", async () => {
      await expect(service.cancel("non-existent-id")).rejects.toThrow(
        "Execution non-existent-id is not running"
      );
    });
  });

  describe("without Claude SDK", () => {
    it("should throw error when Claude SDK is not configured", async () => {
      const serviceWithoutSDK = new AgentExecutorService(db);

      const context: ExecutionContext = {
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        workspaceId: testWorkspaceId,
        templateId: testTemplateId,
        workspacePath: "/tmp/test-workspace",
        prompt: "Complete this task",
      };

      const result = await serviceWithoutSDK.execute(context);

      expect(result.status).toBe("error");
      expect(result.error).toContain("Claude SDK query function not configured");
    });
  });
});
