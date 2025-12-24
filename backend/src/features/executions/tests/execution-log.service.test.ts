import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../../shared/db/schema.js";
import { ExecutionLogService } from "../services/execution-log.service.js";
import type {
  NewAgentExecution,
  NewTemplate,
  NewWorker,
  NewWorkItem,
  NewTrace,
} from "../../../shared/db/schema.js";
import { v4 as uuidv4 } from "uuid";

describe("ExecutionLogService", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: ExecutionLogService;
  let testTemplateId: string;
  let testWorkerId: string;
  let testWorkItemId: string;

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

      CREATE TABLE IF NOT EXISTS agent_executions (
        id TEXT PRIMARY KEY,
        worker_id TEXT,
        work_item_id TEXT,
        workspace_id TEXT,
        template_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        started_at INTEGER,
        completed_at INTEGER,
        duration_ms INTEGER,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        tool_calls_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        output TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (worker_id) REFERENCES workers(id),
        FOREIGN KEY (work_item_id) REFERENCES work_items(id),
        FOREIGN KEY (template_id) REFERENCES templates(id)
      );

      CREATE TABLE IF NOT EXISTS traces (
        id TEXT PRIMARY KEY,
        worker_id TEXT,
        work_item_id TEXT,
        event_type TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (worker_id) REFERENCES workers(id),
        FOREIGN KEY (work_item_id) REFERENCES work_items(id)
      );
    `);

    // Create test template
    testTemplateId = uuidv4();
    const template: NewTemplate = {
      id: testTemplateId,
      name: "Test Template",
      description: "Template for testing",
      createdBy: "test-user",
      systemPrompt: "You are a test agent",
      permissionMode: "askUser",
      maxTurns: 100,
      builtinTools: [],
      mcpServers: [],
      allowedWorkItemTypes: ["*"],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.insert(schema.templates).values(template);

    // Create test work item
    testWorkItemId = uuidv4();
    const workItem: NewWorkItem = {
      id: testWorkItemId,
      title: "Test Work Item",
      type: "task",
      status: "in_progress",
      description: "Work item for testing",
      successCriteria: [],
      linkedFiles: [],
      createdBy: "test-user",
      assignedAgents: {},
      requiresApproval: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      childIds: [],
      blockedBy: [],
    };
    await db.insert(schema.workItems).values(workItem);

    // Create test worker
    testWorkerId = uuidv4();
    const worker: NewWorker = {
      id: testWorkerId,
      templateId: testTemplateId,
      status: "idle",
      sessionId: "test-session",
      spawnedAt: new Date(),
      contextWindowUsed: 0,
      contextWindowLimit: 200000,
      tokensUsed: 0,
      costUsd: 0,
      toolCalls: 0,
      errors: 0,
    };
    await db.insert(schema.workers).values(worker);

    // Initialize service
    service = new ExecutionLogService(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("getExecutionList", () => {
    it("returns paginated executions ordered by createdAt desc", async () => {
      // Arrange: Create 5 executions with different timestamps
      const now = Date.now();
      const executions: NewAgentExecution[] = [];

      for (let i = 0; i < 5; i++) {
        executions.push({
          id: uuidv4(),
          workerId: testWorkerId,
          workItemId: testWorkItemId,
          templateId: testTemplateId,
          status: "success",
          createdAt: new Date(now - i * 1000), // Each 1 second apart
          tokensUsed: 100 * (i + 1),
          costUsd: 0.01 * (i + 1),
          toolCallsCount: i + 1,
        });
      }

      await db.insert(schema.agentExecutions).values(executions);

      // Act: Call service with limit of 3
      const result = await service.getExecutionList({ limit: 3 });

      // Assert
      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(5);
      expect(result.hasMore).toBe(true);

      // Verify order (most recent first)
      expect(result.items[0].createdAt.getTime()).toBeGreaterThan(
        result.items[1].createdAt.getTime()
      );
      expect(result.items[1].createdAt.getTime()).toBeGreaterThan(
        result.items[2].createdAt.getTime()
      );
    });

    it("filters by status", async () => {
      // Arrange: Create executions with different statuses
      const executions: NewAgentExecution[] = [
        {
          id: uuidv4(),
          workerId: testWorkerId,
          workItemId: testWorkItemId,
          templateId: testTemplateId,
          status: "success",
          createdAt: new Date(),
          tokensUsed: 100,
          costUsd: 0.01,
          toolCallsCount: 1,
        },
        {
          id: uuidv4(),
          workerId: testWorkerId,
          workItemId: testWorkItemId,
          templateId: testTemplateId,
          status: "error",
          errorMessage: "Test error",
          createdAt: new Date(),
          tokensUsed: 50,
          costUsd: 0.005,
          toolCallsCount: 0,
        },
        {
          id: uuidv4(),
          workerId: testWorkerId,
          workItemId: testWorkItemId,
          templateId: testTemplateId,
          status: "running",
          createdAt: new Date(),
          tokensUsed: 0,
          costUsd: 0,
          toolCallsCount: 0,
        },
      ];

      await db.insert(schema.agentExecutions).values(executions);

      // Act: Filter by error status
      const result = await service.getExecutionList({ status: "error" });

      // Assert: Only error executions returned
      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe("error");
      expect(result.items[0].errorMessage).toBe("Test error");
    });
  });

  describe("getExecutionById", () => {
    it("returns execution with traces", async () => {
      // Arrange: Create execution and associated traces
      const executionId = uuidv4();
      const execution: NewAgentExecution = {
        id: executionId,
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        templateId: testTemplateId,
        status: "success",
        createdAt: new Date(),
        tokensUsed: 200,
        costUsd: 0.02,
        toolCallsCount: 3,
      };
      await db.insert(schema.agentExecutions).values(execution);

      // Create 3 trace records
      const traces: NewTrace[] = [
        {
          id: uuidv4(),
          workerId: testWorkerId,
          workItemId: testWorkItemId,
          eventType: "tool_call",
          data: { name: "WebSearch", input: { query: "test" } },
          timestamp: new Date(Date.now() - 3000),
        },
        {
          id: uuidv4(),
          workerId: testWorkerId,
          workItemId: testWorkItemId,
          eventType: "agent_state",
          data: { state: "thinking" },
          timestamp: new Date(Date.now() - 2000),
        },
        {
          id: uuidv4(),
          workerId: testWorkerId,
          workItemId: testWorkItemId,
          eventType: "tool_call",
          data: { name: "ReadFile", input: { path: "/test.ts" } },
          timestamp: new Date(Date.now() - 1000),
        },
      ];
      await db.insert(schema.traces).values(traces);

      // Act: Get execution by ID
      const result = await service.getExecutionById(executionId);

      // Assert: Returns execution with traces ordered by timestamp
      expect(result).toBeDefined();
      expect(result?.id).toBe(executionId);
      expect(result?.traces).toHaveLength(3);
      expect(result?.traces[0].eventType).toBe("tool_call");
      expect(result?.traces[0].timestamp.getTime()).toBeLessThan(
        result!.traces[1].timestamp.getTime()
      );
    });
  });

  describe("getTracesByExecutionId", () => {
    it("returns filtered traces", async () => {
      // Arrange: Create execution and traces of different types
      const executionId = uuidv4();
      const execution: NewAgentExecution = {
        id: executionId,
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        templateId: testTemplateId,
        status: "success",
        createdAt: new Date(),
        tokensUsed: 100,
        costUsd: 0.01,
        toolCallsCount: 2,
      };
      await db.insert(schema.agentExecutions).values(execution);

      const traces: NewTrace[] = [
        {
          id: uuidv4(),
          workerId: testWorkerId,
          workItemId: testWorkItemId,
          eventType: "tool_call",
          data: { name: "Tool1" },
          timestamp: new Date(),
        },
        {
          id: uuidv4(),
          workerId: testWorkerId,
          workItemId: testWorkItemId,
          eventType: "error",
          data: { message: "Error occurred" },
          timestamp: new Date(),
        },
        {
          id: uuidv4(),
          workerId: testWorkerId,
          workItemId: testWorkItemId,
          eventType: "tool_call",
          data: { name: "Tool2" },
          timestamp: new Date(),
        },
        {
          id: uuidv4(),
          workerId: testWorkerId,
          workItemId: testWorkItemId,
          eventType: "agent_state",
          data: { state: "idle" },
          timestamp: new Date(),
        },
      ];
      await db.insert(schema.traces).values(traces);

      // Act: Filter by tool_call event type
      const result = await service.getTracesByExecutionId(executionId, {
        eventType: "tool_call",
      });

      // Assert: Only tool_call traces returned
      expect(result).toHaveLength(2);
      expect(result.every((t) => t.eventType === "tool_call")).toBe(true);
    });
  });
});
