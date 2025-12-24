import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Fastify, { type FastifyInstance } from "fastify";
import * as schema from "../../../shared/db/schema.js";
import { agentRuntimeRoutes } from "../handler/agent-runtime.handler.js";
import type { Config } from "../../../shared/config.js";
import { v4 as uuidv4 } from "uuid";

describe("Agent Runtime Routes", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let app: FastifyInstance;
  let config: Config;

  beforeEach(async () => {
    // Create in-memory database
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    db = drizzle(sqlite, { schema });

    // Create tables
    sqlite.exec(`
      CREATE TABLE github_connections (
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

      CREATE TABLE repositories (
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

      CREATE TABLE work_items (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'backlog',
        repository_id TEXT REFERENCES repositories(id),
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

      CREATE TABLE templates (
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

      CREATE TABLE workers (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL REFERENCES templates(id),
        status TEXT NOT NULL DEFAULT 'idle',
        current_work_item_id TEXT REFERENCES work_items(id),
        current_role TEXT,
        session_id TEXT NOT NULL,
        spawned_at INTEGER NOT NULL,
        context_window_used INTEGER NOT NULL DEFAULT 0,
        context_window_limit INTEGER NOT NULL DEFAULT 200000,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        tool_calls INTEGER NOT NULL DEFAULT 0,
        errors INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE workspaces (
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

      CREATE TABLE agent_executions (
        id TEXT PRIMARY KEY,
        worker_id TEXT REFERENCES workers(id),
        work_item_id TEXT REFERENCES work_items(id),
        workspace_id TEXT REFERENCES workspaces(id),
        template_id TEXT REFERENCES templates(id),
        status TEXT NOT NULL DEFAULT 'pending',
        error_message TEXT,
        output TEXT,
        duration_ms INTEGER,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        tool_calls_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER
      );

      CREATE TABLE traces (
        id TEXT PRIMARY KEY,
        worker_id TEXT REFERENCES workers(id),
        work_item_id TEXT REFERENCES work_items(id),
        event_type TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        timestamp INTEGER NOT NULL
      );
    `);

    // Mock config
    config = {
      database: { url: ":memory:" },
      server: { port: 3000, host: "localhost" },
    } as Config;

    // Create Fastify app with routes
    app = Fastify({ logger: false });
    await app.register(agentRuntimeRoutes, { db, config });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    sqlite.close();
  });

  // Helper functions to create test data
  async function createTestTemplate() {
    const id = uuidv4();
    const now = Date.now();
    sqlite
      .prepare(
        `INSERT INTO templates (id, name, description, created_by, system_prompt, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, "Test Template", "A test template", "system", "Test prompt", now, now);
    return id;
  }

  async function createTestWorker(templateId: string) {
    const id = uuidv4();
    const now = Date.now();
    sqlite
      .prepare(
        `INSERT INTO workers (id, template_id, status, session_id, spawned_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(id, templateId, "idle", uuidv4(), now);
    return id;
  }

  async function createTestWorkItem() {
    const id = uuidv4();
    const now = Date.now();
    sqlite
      .prepare(
        `INSERT INTO work_items (id, title, type, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, "Test Work Item", "task", "user-1", now, now);
    return id;
  }

  async function createTestExecution(workerId: string, workItemId: string, templateId: string, status: string = "pending") {
    const id = uuidv4();
    const now = Date.now();
    sqlite
      .prepare(
        `INSERT INTO agent_executions (id, worker_id, work_item_id, template_id, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, workerId, workItemId, templateId, status, now);
    return id;
  }

  async function createTestWorkspace(status: string = "active") {
    const id = uuidv4();
    const now = Date.now();
    sqlite
      .prepare(
        `INSERT INTO workspaces (id, path, status, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(id, `/tmp/workspace-${id}`, status, now);
    return id;
  }

  // Tests for POST /execute
  describe("POST /execute", () => {
    it("should create execution and return 201 with executionId", async () => {
      const templateId = await createTestTemplate();
      const workerId = await createTestWorker(templateId);
      const workItemId = await createTestWorkItem();

      const response = await app.inject({
        method: "POST",
        url: "/execute",
        payload: {
          workerId,
          workItemId,
          prompt: "Test prompt for execution",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.executionId).toBeDefined();
      expect(typeof body.executionId).toBe("string");
    });

    it("should return 400 for missing workerId", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/execute",
        payload: {
          workItemId: "work-item-1",
          prompt: "Test prompt",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Validation failed");
    });

    it("should return 400 for missing workItemId", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/execute",
        payload: {
          workerId: "worker-1",
          prompt: "Test prompt",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Validation failed");
    });

    it("should return 400 for missing prompt", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/execute",
        payload: {
          workerId: "worker-1",
          workItemId: "work-item-1",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Validation failed");
    });

    it("should return 404 for non-existent worker", async () => {
      const workItemId = await createTestWorkItem();

      const response = await app.inject({
        method: "POST",
        url: "/execute",
        payload: {
          workerId: "non-existent-worker",
          workItemId,
          prompt: "Test prompt",
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("Worker");
      expect(body.error).toContain("not found");
    });

    it("should return 404 for non-existent work item", async () => {
      const templateId = await createTestTemplate();
      const workerId = await createTestWorker(templateId);

      const response = await app.inject({
        method: "POST",
        url: "/execute",
        payload: {
          workerId,
          workItemId: "non-existent-work-item",
          prompt: "Test prompt",
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("Work item");
      expect(body.error).toContain("not found");
    });
  });

  // Tests for GET /executions/:id
  describe("GET /executions/:id", () => {
    it("should return 200 with execution details", async () => {
      const templateId = await createTestTemplate();
      const workerId = await createTestWorker(templateId);
      const workItemId = await createTestWorkItem();
      const executionId = await createTestExecution(workerId, workItemId, templateId);

      const response = await app.inject({
        method: "GET",
        url: `/executions/${executionId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(executionId);
      expect(body.workerId).toBe(workerId);
      expect(body.workItemId).toBe(workItemId);
      expect(body.status).toBe("pending");
    });

    it("should return 404 for non-existent execution", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/executions/non-existent-execution",
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("Execution");
      expect(body.error).toContain("not found");
    });
  });

  // Tests for POST /executions/:id/cancel
  describe("POST /executions/:id/cancel", () => {
    it("should cancel running execution and return 200", async () => {
      const templateId = await createTestTemplate();
      const workerId = await createTestWorker(templateId);
      const workItemId = await createTestWorkItem();
      const executionId = await createTestExecution(workerId, workItemId, templateId, "running");

      const response = await app.inject({
        method: "POST",
        url: `/executions/${executionId}/cancel`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(executionId);
      expect(body.status).toBe("cancelled");
      expect(body.completedAt).not.toBeNull();
    });

    it("should cancel pending execution and return 200", async () => {
      const templateId = await createTestTemplate();
      const workerId = await createTestWorker(templateId);
      const workItemId = await createTestWorkItem();
      const executionId = await createTestExecution(workerId, workItemId, templateId, "pending");

      const response = await app.inject({
        method: "POST",
        url: `/executions/${executionId}/cancel`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("cancelled");
    });

    it("should return 404 for non-existent execution", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/executions/non-existent-execution/cancel",
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("Execution");
      expect(body.error).toContain("not found");
    });

    it("should return 409 for completed execution", async () => {
      const templateId = await createTestTemplate();
      const workerId = await createTestWorker(templateId);
      const workItemId = await createTestWorkItem();
      const executionId = await createTestExecution(workerId, workItemId, templateId, "success");

      const response = await app.inject({
        method: "POST",
        url: `/executions/${executionId}/cancel`,
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("not running");
    });

    it("should return 409 for cancelled execution", async () => {
      const templateId = await createTestTemplate();
      const workerId = await createTestWorker(templateId);
      const workItemId = await createTestWorkItem();
      const executionId = await createTestExecution(workerId, workItemId, templateId, "cancelled");

      const response = await app.inject({
        method: "POST",
        url: `/executions/${executionId}/cancel`,
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("not running");
    });

    it("should return 409 for error execution", async () => {
      const templateId = await createTestTemplate();
      const workerId = await createTestWorker(templateId);
      const workItemId = await createTestWorkItem();
      const executionId = await createTestExecution(workerId, workItemId, templateId, "error");

      const response = await app.inject({
        method: "POST",
        url: `/executions/${executionId}/cancel`,
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("not running");
    });
  });

  // Tests for GET /workspaces
  describe("GET /workspaces", () => {
    it("should return 200 with array of active workspaces", async () => {
      await createTestWorkspace("active");
      await createTestWorkspace("active");
      await createTestWorkspace("completed"); // Should not be returned

      const response = await app.inject({
        method: "GET",
        url: "/workspaces",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(2);
      body.forEach((workspace: any) => {
        expect(workspace.status).toBe("active");
      });
    });

    it("should return empty array when no active workspaces exist", async () => {
      await createTestWorkspace("completed");
      await createTestWorkspace("error");

      const response = await app.inject({
        method: "GET",
        url: "/workspaces",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual([]);
    });
  });

  // Tests for DELETE /workspaces/:id
  describe("DELETE /workspaces/:id", () => {
    it("should delete workspace and return 200", async () => {
      const workspaceId = await createTestWorkspace("active");

      const response = await app.inject({
        method: "DELETE",
        url: `/workspaces/${workspaceId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toContain("deleted successfully");

      // Verify workspace is deleted
      const getResponse = await app.inject({
        method: "GET",
        url: "/workspaces",
      });
      const workspaces = JSON.parse(getResponse.body);
      expect(workspaces.find((w: any) => w.id === workspaceId)).toBeUndefined();
    });

    it("should return 404 for non-existent workspace", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/workspaces/non-existent-workspace",
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("Workspace");
      expect(body.error).toContain("not found");
    });
  });
});
