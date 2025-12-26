import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Fastify, { type FastifyInstance } from "fastify";
import * as schema from "../../../shared/db/schema.js";
import { agentsHandler } from "../handler/agents.handler.js";
import type { Config } from "../../../shared/config.js";
import type { WorkerPoolService } from "../../workers/services/worker-pool.service.js";
import { WorkerRepository } from "../../workers/repositories/worker.repository.js";
import { v4 as uuidv4 } from "uuid";

describe("Agents Handler", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let app: FastifyInstance;
  let config: Config;
  let workerPoolService: WorkerPoolService;

  beforeEach(async () => {
    // Create in-memory database
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    db = drizzle(sqlite, { schema });

    // Create tables
    sqlite.exec(`
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

      CREATE TABLE work_items (
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
        repository_id TEXT,
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
    `);

    // Mock config
    config = {
      database: { url: ":memory:" },
      server: { port: 3000, host: "localhost" },
    } as Config;

    // Create mock workerPoolService
    workerPoolService = {
      canSpawnMore: vi.fn().mockResolvedValue(true),
      terminate: vi.fn().mockResolvedValue({}),
    } as unknown as WorkerPoolService;

    // Create Fastify app with handlers
    app = Fastify({ logger: false });
    await app.register(agentsHandler, { db, config, workerPoolService });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    sqlite.close();
    vi.restoreAllMocks();
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

  // Tests for POST /start
  describe("POST /start", () => {
    it("should create execution and return 202 with valid taskId", async () => {
      const workItemId = await createTestWorkItem();
      const response = await app.inject({
        method: "POST",
        url: "/start",
        payload: { taskId: workItemId },
      });
      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.status).toBe("pending");
      expect(response.headers.location).toBe(`/api/agents/${body.id}`);
    });

    it("should return 400 for missing taskId", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/start",
        payload: {},
      });
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Validation failed");
    });

    it("should return 409 when max workers reached", async () => {
      vi.mocked(workerPoolService.canSpawnMore).mockResolvedValue(false);
      const workItemId = await createTestWorkItem();
      const response = await app.inject({
        method: "POST",
        url: "/start",
        payload: { taskId: workItemId },
      });
      expect(response.statusCode).toBe(409);
    });
  });

  // Tests for DELETE /:id
  describe("DELETE /:id", () => {
    it("should cancel pending execution and return 204", async () => {
      const workItemId = await createTestWorkItem();
      const startResponse = await app.inject({
        method: "POST",
        url: "/start",
        payload: { taskId: workItemId },
      });
      const { id: agentId } = JSON.parse(startResponse.body);

      const response = await app.inject({
        method: "DELETE",
        url: `/${agentId}`,
      });
      expect(response.statusCode).toBe(204);
    });

    it("should return 404 for non-existent agent", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: `/${uuidv4()}`,
      });
      expect(response.statusCode).toBe(404);
    });

    it("should return 409 for already-completed execution", async () => {
      const workItemId = await createTestWorkItem();
      const startResponse = await app.inject({
        method: "POST",
        url: "/start",
        payload: { taskId: workItemId },
      });
      const { id: agentId } = JSON.parse(startResponse.body);

      // Manually set status to success
      sqlite
        .prepare(`UPDATE agent_executions SET status = ? WHERE id = ?`)
        .run("success", agentId);

      const response = await app.inject({
        method: "DELETE",
        url: `/${agentId}`,
      });
      expect(response.statusCode).toBe(409);
    });
  });

  // Tests for GET /
  describe("GET /", () => {
    it("should return array of pending agents", async () => {
      const workItemId = await createTestWorkItem();
      await app.inject({
        method: "POST",
        url: "/start",
        payload: { taskId: workItemId },
      });

      const response = await app.inject({
        method: "GET",
        url: "/",
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body.agents)).toBe(true);
      expect(body.agents.length).toBe(1);
    });

    it("should return empty array when no active agents", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/",
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.agents).toEqual([]);
    });

    it("should not include completed agents", async () => {
      const workItemId = await createTestWorkItem();
      const startResponse = await app.inject({
        method: "POST",
        url: "/start",
        payload: { taskId: workItemId },
      });
      const { id: agentId } = JSON.parse(startResponse.body);

      // Set status to success
      sqlite
        .prepare(`UPDATE agent_executions SET status = ? WHERE id = ?`)
        .run("success", agentId);

      const response = await app.inject({
        method: "GET",
        url: "/",
      });
      const body = JSON.parse(response.body);
      expect(body.agents.length).toBe(0);
    });
  });

  // Tests for GET /:id
  describe("GET /:id", () => {
    it("should return full agent details with metrics", async () => {
      const workItemId = await createTestWorkItem();
      const startResponse = await app.inject({
        method: "POST",
        url: "/start",
        payload: { taskId: workItemId },
      });
      const { id: agentId } = JSON.parse(startResponse.body);

      const response = await app.inject({
        method: "GET",
        url: `/${agentId}`,
      });
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(agentId);
      expect(body.status).toBe("pending");
      expect(body.metrics).toBeDefined();
      expect(body.metrics.tokensUsed).toBeDefined();
      expect(body.metrics.costUsd).toBeDefined();
      expect(body.metrics.toolCallsCount).toBeDefined();
    });

    it("should return 404 for non-existent agent", async () => {
      const response = await app.inject({
        method: "GET",
        url: `/${uuidv4()}`,
      });
      expect(response.statusCode).toBe(404);
    });

    it("should include Retry-After header when status is running", async () => {
      const workItemId = await createTestWorkItem();
      const startResponse = await app.inject({
        method: "POST",
        url: "/start",
        payload: { taskId: workItemId },
      });
      const { id: agentId } = JSON.parse(startResponse.body);

      // Set status to running
      sqlite
        .prepare(`UPDATE agent_executions SET status = ? WHERE id = ?`)
        .run("running", agentId);

      const response = await app.inject({
        method: "GET",
        url: `/${agentId}`,
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers["retry-after"]).toBe("5");
    });
  });

  // Integration test for full lifecycle
  describe("Full lifecycle", () => {
    it("should complete start -> get -> list -> stop workflow", async () => {
      const workItemId = await createTestWorkItem();

      // 1. Start agent
      const startResponse = await app.inject({
        method: "POST",
        url: "/start",
        payload: { taskId: workItemId },
      });
      expect(startResponse.statusCode).toBe(202);
      const { id: agentId } = JSON.parse(startResponse.body);

      // 2. Get agent details
      const getResponse = await app.inject({
        method: "GET",
        url: `/${agentId}`,
      });
      expect(getResponse.statusCode).toBe(200);

      // 3. List agents
      const listResponse = await app.inject({
        method: "GET",
        url: "/",
      });
      expect(listResponse.statusCode).toBe(200);
      const { agents } = JSON.parse(listResponse.body);
      expect(agents.some((a: { id: string }) => a.id === agentId)).toBe(true);

      // 4. Stop agent
      const stopResponse = await app.inject({
        method: "DELETE",
        url: `/${agentId}`,
      });
      expect(stopResponse.statusCode).toBe(204);

      // 5. Verify agent is no longer in list
      const listAfterStop = await app.inject({
        method: "GET",
        url: "/",
      });
      const { agents: agentsAfterStop } = JSON.parse(listAfterStop.body);
      expect(agentsAfterStop.some((a: { id: string }) => a.id === agentId)).toBe(false);
    });
  });
});
