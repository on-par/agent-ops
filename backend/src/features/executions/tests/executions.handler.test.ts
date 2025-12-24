import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../../shared/db/schema.js";
import { executionsHandler } from "../handler/executions.handler.js";
import type {
  NewAgentExecution,
  NewTemplate,
  NewWorker,
  NewWorkItem,
  NewTrace,
} from "../../../shared/db/schema.js";
import { v4 as uuidv4 } from "uuid";

describe("ExecutionsHandler", () => {
  let app: FastifyInstance;
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let testTemplateId: string;
  let testWorkerId: string;
  let testWorkItemId: string;

  beforeEach(async () => {
    // Create in-memory database
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

    // Initialize Fastify app with plugin
    app = Fastify();
    await app.register(executionsHandler, {
      prefix: "/api/executions",
      db,
    });
  });

  afterEach(async () => {
    await app.close();
    sqlite.close();
  });

  describe("GET /api/executions", () => {
    it("returns paginated list", async () => {
      // Arrange: Create executions
      const executions: NewAgentExecution[] = [];
      for (let i = 0; i < 15; i++) {
        executions.push({
          id: uuidv4(),
          workerId: testWorkerId,
          workItemId: testWorkItemId,
          templateId: testTemplateId,
          status: "success",
          createdAt: new Date(Date.now() - i * 1000),
          tokensUsed: 100,
          costUsd: 0.01,
          toolCallsCount: 1,
        });
      }
      await db.insert(schema.agentExecutions).values(executions);

      // Act: GET with limit
      const response = await app.inject({
        method: "GET",
        url: "/api/executions?limit=10",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items).toHaveLength(10);
      expect(body.total).toBe(15);
      expect(body.hasMore).toBe(true);
    });
  });

  describe("GET /api/executions/:id", () => {
    it("returns execution with traces", async () => {
      // Arrange: Create execution with traces
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
          eventType: "tool_call",
          data: { name: "Tool2" },
          timestamp: new Date(),
        },
      ];
      await db.insert(schema.traces).values(traces);

      // Act: GET by ID
      const response = await app.inject({
        method: "GET",
        url: `/api/executions/${executionId}`,
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(executionId);
      expect(body.traces).toHaveLength(2);
    });

    it("returns 404 for non-existent execution", async () => {
      // Act: GET non-existent ID
      const response = await app.inject({
        method: "GET",
        url: "/api/executions/non-existent-id",
      });

      // Assert
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Execution not found");
    });
  });

  describe("GET /api/executions/:id/traces", () => {
    it("returns filtered traces", async () => {
      // Arrange: Create execution with different trace types
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
          data: { message: "Error" },
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
      ];
      await db.insert(schema.traces).values(traces);

      // Act: GET traces filtered by tool_call
      const response = await app.inject({
        method: "GET",
        url: `/api/executions/${executionId}/traces?eventType=tool_call`,
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(2);
      expect(body.every((t: any) => t.eventType === "tool_call")).toBe(true);
    });
  });
});
