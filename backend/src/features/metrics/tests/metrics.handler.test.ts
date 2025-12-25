import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../../shared/db/schema.js";
import { metricsHandler } from "../handler/metrics.handler.js";
import { tracesHandler } from "../handler/traces.handler.js";
import type {
  NewWorker,
  NewWorkItem,
  NewAgentExecution,
  NewTrace,
} from "../../../shared/db/schema.js";

describe("MetricsHandler", () => {
  let app: FastifyInstance;
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;

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
        last_heartbeat INTEGER,
        terminated_at INTEGER
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
        github_pr_number INTEGER,
        github_pr_url TEXT,
        description TEXT NOT NULL DEFAULT '',
        success_criteria TEXT NOT NULL DEFAULT '[]',
        linked_files TEXT NOT NULL DEFAULT '[]',
        priority TEXT NOT NULL DEFAULT 'medium',
        estimated_effort INTEGER,
        actual_effort INTEGER,
        parent_id TEXT,
        child_ids TEXT NOT NULL DEFAULT '[]',
        blocked_by TEXT,
        assigned_agents TEXT,
        requires_approval TEXT NOT NULL DEFAULT '{}',
        metadata TEXT,
        created_by TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER
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
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS traces (
        id TEXT PRIMARY KEY,
        worker_id TEXT,
        work_item_id TEXT,
        event_type TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL
      );

      -- Insert dummy template for workers
      INSERT INTO templates (id, name, created_by, system_prompt, created_at, updated_at)
      VALUES ('template-1', 'Test Template', 'system', 'Test prompt', ${Date.now()}, ${Date.now()});
      INSERT INTO workspaces (id, path) VALUES ('workspace-1', '/test');
    `);

    // Create and register Fastify app with handlers
    app = Fastify();

    // Register metrics handlers
    await app.register(metricsHandler, {
      prefix: "/api/metrics",
      db,
    });

    await app.register(tracesHandler, {
      prefix: "/api/traces",
      db,
    });

    // Start the app
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    sqlite.close();
  });

  describe("GET /api/metrics/agents", () => {
    it("should return 200 with correct structure when no workers exist", async () => {
      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/metrics/agents",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("metadata");
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.metadata).toHaveProperty("count");
      expect(body.metadata).toHaveProperty("limit");
      expect(body.metadata).toHaveProperty("offset");
    });

    it("should return agent data when workers exist", async () => {
      // Arrange
      const now = Date.now();
      const worker: NewWorker = {
        id: "worker-1",
        templateId: "template-1",
        status: "idle",
        currentWorkItemId: null,
        currentRole: null,
        sessionId: "session-1",
        spawnedAt: new Date(now),
        contextWindowUsed: 0,
        contextWindowLimit: 200000,
        tokensUsed: 100,
        costUsd: 0.01,
        toolCalls: 5,
        errors: 0,
        lastHeartbeat: new Date(now),
        terminatedAt: null,
      };

      db.insert(schema.workers).values(worker).run();

      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/metrics/agents",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]).toHaveProperty("workerId");
      expect(body.data[0]).toHaveProperty("status");
      expect(body.data[0]).toHaveProperty("templateId");
      expect(body.data[0]).toHaveProperty("currentWorkload");
      expect(body.data[0]).toHaveProperty("performance");
    });

    it("should filter by templateId", async () => {
      // Arrange
      const now = Date.now();
      sqlite.exec(`
        INSERT INTO templates (id, name, created_by, system_prompt, created_at, updated_at)
        VALUES ('template-2', 'Different Template', 'system', 'Test prompt', ${now}, ${now});
      `);

      const workers: NewWorker[] = [
        {
          id: "worker-1",
          templateId: "template-1",
          status: "idle",
          currentWorkItemId: null,
          currentRole: null,
          sessionId: "session-1",
          spawnedAt: new Date(now),
          contextWindowUsed: 0,
          contextWindowLimit: 200000,
          tokensUsed: 100,
          costUsd: 0.01,
          toolCalls: 5,
          errors: 0,
          lastHeartbeat: new Date(now),
          terminatedAt: null,
        },
        {
          id: "worker-2",
          templateId: "template-2",
          status: "idle",
          currentWorkItemId: null,
          currentRole: null,
          sessionId: "session-2",
          spawnedAt: new Date(now),
          contextWindowUsed: 0,
          contextWindowLimit: 200000,
          tokensUsed: 100,
          costUsd: 0.01,
          toolCalls: 5,
          errors: 0,
          lastHeartbeat: new Date(now),
          terminatedAt: null,
        },
      ];

      db.insert(schema.workers).values(workers).run();

      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/metrics/agents?templateId=template-2",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].templateId).toBe("template-2");
    });

    it("should respect pagination", async () => {
      // Arrange - create 5 workers
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        const worker: NewWorker = {
          id: `worker-${i}`,
          templateId: "template-1",
          status: "idle",
          currentWorkItemId: null,
          currentRole: null,
          sessionId: `session-${i}`,
          spawnedAt: new Date(now),
          contextWindowUsed: 0,
          contextWindowLimit: 200000,
          tokensUsed: 100,
          costUsd: 0.01,
          toolCalls: 5,
          errors: 0,
          lastHeartbeat: new Date(now),
          terminatedAt: null,
        };
        db.insert(schema.workers).values(worker).run();
      }

      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/metrics/agents?limit=2&offset=1",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(2);
      expect(body.metadata.limit).toBe(2);
      expect(body.metadata.offset).toBe(1);
    });
  });

  describe("GET /api/metrics/work", () => {
    it("should return 200 with correct structure", async () => {
      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/metrics/work",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("metadata");
      expect(body.data).toHaveProperty("totalCount");
      expect(body.data).toHaveProperty("byStatus");
      expect(body.data).toHaveProperty("byType");
      expect(body.data).toHaveProperty("avgCompletionTimeMs");
    });

    it("should count work items by status", async () => {
      // Arrange
      const now = Date.now();
      const workItems: NewWorkItem[] = [
        {
          id: "work-1",
          title: "Task 1",
          type: "bug",
          status: "backlog",
          repositoryId: null,
          githubIssueId: null,
          githubIssueNumber: null,
          githubIssueUrl: null,
          githubPrNumber: null,
          githubPrUrl: null,
          description: "",
          successCriteria: [],
          linkedFiles: [],
          priority: "medium",
          estimatedEffort: null,
          actualEffort: null,
          parentId: null,
          childIds: [],
          blockedBy: null,
          assignedAgents: null,
          requiresApproval: {},
          metadata: null,
          createdBy: null,
          createdAt: new Date(now),
          updatedAt: new Date(now),
          startedAt: null,
          completedAt: null,
        },
        {
          id: "work-2",
          title: "Task 2",
          type: "feature",
          status: "ready",
          repositoryId: null,
          githubIssueId: null,
          githubIssueNumber: null,
          githubIssueUrl: null,
          githubPrNumber: null,
          githubPrUrl: null,
          description: "",
          successCriteria: [],
          linkedFiles: [],
          priority: "medium",
          estimatedEffort: null,
          actualEffort: null,
          parentId: null,
          childIds: [],
          blockedBy: null,
          assignedAgents: null,
          requiresApproval: {},
          metadata: null,
          createdBy: null,
          createdAt: new Date(now),
          updatedAt: new Date(now),
          startedAt: null,
          completedAt: null,
        },
      ];

      db.insert(schema.workItems).values(workItems).run();

      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/metrics/work",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.byStatus).toBeDefined();
      expect(body.data.byType).toBeDefined();
      expect(typeof body.data.byType.bug).toBe("number");
      expect(typeof body.data.byType.feature).toBe("number");
    });
  });

  describe("GET /api/metrics/system", () => {
    it("should return 200 with system metrics", async () => {
      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/metrics/system",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("metadata");
      expect(body.data).toHaveProperty("workers");
      expect(body.data).toHaveProperty("workItems");
      expect(body.data).toHaveProperty("traces");
      expect(body.data).toHaveProperty("system");
    });

    it("should include all worker counts", async () => {
      // Arrange
      const now = Date.now();
      const worker: NewWorker = {
        id: "worker-1",
        templateId: "template-1",
        status: "idle",
        currentWorkItemId: null,
        currentRole: null,
        sessionId: "session-1",
        spawnedAt: new Date(now),
        contextWindowUsed: 0,
        contextWindowLimit: 200000,
        tokensUsed: 100,
        costUsd: 0.01,
        toolCalls: 5,
        errors: 0,
        lastHeartbeat: new Date(now),
        terminatedAt: null,
      };

      db.insert(schema.workers).values(worker).run();

      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/metrics/system",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.workers).toHaveProperty("total");
      expect(body.data.workers).toHaveProperty("active");
      expect(body.data.workers).toHaveProperty("idle");
      expect(body.data.workers).toHaveProperty("offline");
    });
  });
});

describe("TracesHandler", () => {
  let app: FastifyInstance;
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;

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
        last_heartbeat INTEGER,
        terminated_at INTEGER
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
        github_pr_number INTEGER,
        github_pr_url TEXT,
        description TEXT NOT NULL DEFAULT '',
        success_criteria TEXT NOT NULL DEFAULT '[]',
        linked_files TEXT NOT NULL DEFAULT '[]',
        priority TEXT NOT NULL DEFAULT 'medium',
        estimated_effort INTEGER,
        actual_effort INTEGER,
        parent_id TEXT,
        child_ids TEXT NOT NULL DEFAULT '[]',
        blocked_by TEXT,
        assigned_agents TEXT,
        requires_approval TEXT NOT NULL DEFAULT '{}',
        metadata TEXT,
        created_by TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS traces (
        id TEXT PRIMARY KEY,
        worker_id TEXT,
        work_item_id TEXT,
        event_type TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL
      );

      -- Insert dummy template for workers
      INSERT INTO templates (id, name, created_by, system_prompt, created_at, updated_at)
      VALUES ('template-1', 'Test Template', 'system', 'Test prompt', ${Date.now()}, ${Date.now()});
      INSERT INTO workspaces (id, path) VALUES ('workspace-1', '/test');
    `);

    // Create and register Fastify app with handlers
    app = Fastify();

    // Register traces handler
    await app.register(tracesHandler, {
      prefix: "/api/traces",
      db,
    });

    // Start the app
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    sqlite.close();
  });

  describe("GET /api/traces", () => {
    it("should return 200 with traces array", async () => {
      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/traces",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("metadata");
      expect(Array.isArray(body.data)).toBe(true);
    });

    it("should filter by workerId", async () => {
      // Arrange
      const now = Date.now();
      const traces: NewTrace[] = [
        {
          id: "trace-1",
          eventType: "tool_call",
          timestamp: new Date(now),
          workerId: "worker-1",
          workItemId: null,
          data: {},
        },
        {
          id: "trace-2",
          eventType: "tool_call",
          timestamp: new Date(now),
          workerId: "worker-2",
          workItemId: null,
          data: {},
        },
      ];

      db.insert(schema.traces).values(traces).run();

      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/traces?workerId=worker-1",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.every((t: any) => t.workerId === "worker-1")).toBe(true);
    });

    it("should filter by eventType", async () => {
      // Arrange
      const now = Date.now();
      const traces: NewTrace[] = [
        {
          id: "trace-1",
          eventType: "error",
          timestamp: new Date(now),
          workerId: null,
          workItemId: null,
          data: {},
        },
        {
          id: "trace-2",
          eventType: "tool_call",
          timestamp: new Date(now),
          workerId: null,
          workItemId: null,
          data: {},
        },
      ];

      db.insert(schema.traces).values(traces).run();

      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/traces?eventType=error",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.every((t: any) => t.eventType === "error")).toBe(true);
    });

    it("should respect pagination", async () => {
      // Arrange - create 5 traces
      const now = Date.now();
      const traces: NewTrace[] = [];
      for (let i = 0; i < 5; i++) {
        traces.push({
          id: `trace-${i}`,
          eventType: "tool_call",
          timestamp: new Date(now - i * 1000),
          workerId: null,
          workItemId: null,
          data: {},
        });
      }

      db.insert(schema.traces).values(traces).run();

      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/traces?limit=2&offset=1",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(2);
      expect(body.metadata.limit).toBe(2);
      expect(body.metadata.offset).toBe(1);
    });
  });
});
