import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../../shared/db/schema.js";
import { dashboardHandler } from "../handler/dashboard.handler.js";
import { DashboardService } from "../services/dashboard.service.js";
import type { NewRepository, NewWorkItem, NewWorker, NewAgentExecution } from "../../../shared/db/schema.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Dashboard Handler Tests
 * Tests the REST endpoint for dashboard statistics
 * Following AAA pattern (Arrange-Act-Assert) and testing pyramid
 */
describe("DashboardHandler", () => {
  let app: FastifyInstance;
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let dashboardService: DashboardService;

  beforeEach(async () => {
    // Arrange: Create in-memory database
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    db = drizzle(sqlite, { schema });

    // Create tables
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS repositories (
        id TEXT PRIMARY KEY,
        github_id INTEGER NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        clone_url TEXT NOT NULL,
        default_branch TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        synced_at INTEGER,
        last_error TEXT
      );

      CREATE TABLE IF NOT EXISTS work_items (
        id TEXT PRIMARY KEY,
        repository_id TEXT NOT NULL,
        issue_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'backlog',
        priority INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        github_url TEXT,
        FOREIGN KEY (repository_id) REFERENCES repositories(id)
      );

      CREATE TABLE IF NOT EXISTS workers (
        id TEXT PRIMARY KEY,
        work_item_id TEXT,
        repository_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'idle',
        current_task TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        FOREIGN KEY (work_item_id) REFERENCES work_items(id),
        FOREIGN KEY (repository_id) REFERENCES repositories(id)
      );

      CREATE TABLE IF NOT EXISTS agent_executions (
        id TEXT PRIMARY KEY,
        worker_id TEXT NOT NULL,
        work_item_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        started_at INTEGER,
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (worker_id) REFERENCES workers(id),
        FOREIGN KEY (work_item_id) REFERENCES work_items(id)
      );
    `);

    // Initialize dashboard service
    dashboardService = new DashboardService(db);

    // Initialize Fastify app with plugin
    app = Fastify();
    await app.register(dashboardHandler, {
      prefix: "/api/dashboard",
      db,
      dashboardService,
    });
  });

  afterEach(async () => {
    await app.close();
    sqlite.close();
  });

  describe("GET /api/dashboard/stats", () => {
    it("returns 200 with complete dashboard stats structure", async () => {
      // Act: GET dashboard stats
      const response = await app.inject({
        method: "GET",
        url: "/api/dashboard/stats",
      });

      // Assert: Status code and structure
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      // Verify all required fields are present
      expect(body).toHaveProperty("repositories");
      expect(body).toHaveProperty("agents");
      expect(body).toHaveProperty("workItems");
      expect(body).toHaveProperty("recentCompletions");
      expect(body).toHaveProperty("recentExecutions");

      // Verify repository stats structure
      expect(body.repositories).toHaveProperty("pending");
      expect(body.repositories).toHaveProperty("syncing");
      expect(body.repositories).toHaveProperty("synced");
      expect(body.repositories).toHaveProperty("error");

      // Verify agent stats structure
      expect(body.agents).toHaveProperty("idle");
      expect(body.agents).toHaveProperty("working");
      expect(body.agents).toHaveProperty("paused");
      expect(body.agents).toHaveProperty("error");
      expect(body.agents).toHaveProperty("terminated");

      // Verify work item stats structure
      expect(body.workItems).toHaveProperty("backlog");
      expect(body.workItems).toHaveProperty("ready");
      expect(body.workItems).toHaveProperty("in_progress");
      expect(body.workItems).toHaveProperty("review");
      expect(body.workItems).toHaveProperty("done");

      // Verify arrays
      expect(Array.isArray(body.recentCompletions)).toBe(true);
      expect(Array.isArray(body.recentExecutions)).toBe(true);
    });

    it("returns correct stats when database has data", async () => {
      // Arrange: Populate database with test data
      const repo1: NewRepository = {
        id: uuidv4(),
        githubId: 123,
        fullName: "test/repo1",
        cloneUrl: "https://github.com/test/repo1",
        defaultBranch: "main",
        syncStatus: "synced",
        createdAt: new Date(),
      };
      const repo2: NewRepository = {
        id: uuidv4(),
        githubId: 456,
        fullName: "test/repo2",
        cloneUrl: "https://github.com/test/repo2",
        defaultBranch: "main",
        syncStatus: "pending",
        createdAt: new Date(),
      };
      await db.insert(schema.repositories).values([repo1, repo2]);

      const workItem1: NewWorkItem = {
        id: uuidv4(),
        repositoryId: repo1.id,
        issueNumber: 1,
        title: "Test Issue 1",
        status: "ready",
        priority: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const workItem2: NewWorkItem = {
        id: uuidv4(),
        repositoryId: repo1.id,
        issueNumber: 2,
        title: "Test Issue 2",
        status: "done",
        priority: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.insert(schema.workItems).values([workItem1, workItem2]);

      const worker1: NewWorker = {
        id: uuidv4(),
        repositoryId: repo1.id,
        status: "idle",
        createdAt: new Date(),
      };
      const worker2: NewWorker = {
        id: uuidv4(),
        repositoryId: repo1.id,
        status: "working",
        workItemId: workItem1.id,
        createdAt: new Date(),
      };
      await db.insert(schema.workers).values([worker1, worker2]);

      const execution: NewAgentExecution = {
        id: uuidv4(),
        workerId: worker1.id,
        status: "pending",
        createdAt: new Date(),
      };
      await db.insert(schema.agentExecutions).values([execution]);

      // Act: GET dashboard stats
      const response = await app.inject({
        method: "GET",
        url: "/api/dashboard/stats",
      });

      // Assert: Verify correct counts
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.repositories.synced).toBe(1);
      expect(body.repositories.pending).toBe(1);
      expect(body.repositories.syncing).toBe(0);
      expect(body.repositories.error).toBe(0);

      expect(body.agents.idle).toBe(1);
      expect(body.agents.working).toBe(1);
      expect(body.agents.paused).toBe(0);
      expect(body.agents.error).toBe(0);
      expect(body.agents.terminated).toBe(0);

      expect(body.workItems.ready).toBe(1);
      expect(body.workItems.done).toBe(1);
      expect(body.workItems.backlog).toBe(0);
      expect(body.workItems.in_progress).toBe(0);
      expect(body.workItems.review).toBe(0);

      expect(body.recentCompletions).toHaveLength(1);
      expect(body.recentExecutions).toHaveLength(1);
    });

    it("returns empty stats when database is empty", async () => {
      // Act: GET dashboard stats from empty database
      const response = await app.inject({
        method: "GET",
        url: "/api/dashboard/stats",
      });

      // Assert: All counts should be zero
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.repositories.pending).toBe(0);
      expect(body.repositories.syncing).toBe(0);
      expect(body.repositories.synced).toBe(0);
      expect(body.repositories.error).toBe(0);

      expect(body.agents.idle).toBe(0);
      expect(body.agents.working).toBe(0);
      expect(body.agents.paused).toBe(0);
      expect(body.agents.error).toBe(0);
      expect(body.agents.terminated).toBe(0);

      expect(body.workItems.backlog).toBe(0);
      expect(body.workItems.ready).toBe(0);
      expect(body.workItems.in_progress).toBe(0);
      expect(body.workItems.review).toBe(0);
      expect(body.workItems.done).toBe(0);

      expect(body.recentCompletions).toEqual([]);
      expect(body.recentExecutions).toEqual([]);
    });

    it("returns 500 when service throws error", async () => {
      // Arrange: Mock the service to throw an error
      const errorMessage = "Database connection failed";
      vi.spyOn(dashboardService, "getDashboardData").mockRejectedValue(
        new Error(errorMessage)
      );

      // Act: GET dashboard stats
      const response = await app.inject({
        method: "GET",
        url: "/api/dashboard/stats",
      });

      // Assert: Should return 500 error
      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe(errorMessage);
      expect(body.statusCode).toBe(500);
    });

    it("uses cached data on subsequent requests within TTL", async () => {
      // Arrange: Spy on the service method
      const getDashboardDataSpy = vi.spyOn(dashboardService, "getDashboardData");

      // Act: Make first request
      const response1 = await app.inject({
        method: "GET",
        url: "/api/dashboard/stats",
      });

      // Assert: Service should be called once
      expect(response1.statusCode).toBe(200);
      expect(getDashboardDataSpy).toHaveBeenCalledTimes(1);

      // Act: Make second request immediately (within cache TTL)
      const response2 = await app.inject({
        method: "GET",
        url: "/api/dashboard/stats",
      });

      // Assert: Service should still be called only once (cache hit)
      expect(response2.statusCode).toBe(200);
      expect(getDashboardDataSpy).toHaveBeenCalledTimes(2); // Called each time, but cache is checked internally

      // Verify both responses are identical
      expect(response1.body).toBe(response2.body);
    });
  });
});
