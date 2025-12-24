import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Fastify, { type FastifyInstance } from "fastify";
import * as schema from "../../../shared/db/schema.js";
import { workItemsHandler } from "../handler/work-items.handler.js";
import { WorkItemRepository } from "../repositories/work-item.repository.js";
import { WorkItemService } from "../services/work-item.service.js";

describe("Work Items Routes", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let app: FastifyInstance;
  let service: WorkItemService;

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
      )
    `);

    // Create service
    const repository = new WorkItemRepository(db);
    service = new WorkItemService(repository);

    // Create Fastify app with routes
    app = Fastify({ logger: false });
    await app.register(workItemsHandler, { service });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    sqlite.close();
  });

  // Helper to create a work item for tests
  async function createTestWorkItem(overrides?: Partial<{
    title: string;
    type: string;
    status: string;
    createdBy: string;
  }>) {
    const response = await app.inject({
      method: "POST",
      url: "/",
      payload: {
        title: overrides?.title ?? "Test Work Item",
        type: overrides?.type ?? "task",
        createdBy: overrides?.createdBy ?? "user-1",
        status: overrides?.status,
      },
    });
    return JSON.parse(response.body);
  }

  // Phase 2: Create and Read Endpoints

  describe("POST /work-items", () => {
    it("should create work item and return 201", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/",
        payload: {
          title: "New Feature",
          type: "feature",
          createdBy: "user-123",
          description: "A new feature description",
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.title).toBe("New Feature");
      expect(body.type).toBe("feature");
      expect(body.status).toBe("backlog");
      expect(body.createdBy).toBe("user-123");
      expect(body.description).toBe("A new feature description");
    });

    it("should return 400 for invalid input (missing title)", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/",
        payload: {
          type: "task",
          createdBy: "user-123",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      // Validation error - can be from Zod or Fastify
      expect(body.error || body.message).toBeDefined();
    });

    it("should return 400 for invalid input (invalid type)", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/",
        payload: {
          title: "Test",
          type: "invalid_type",
          createdBy: "user-123",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should create work item with success criteria", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/",
        payload: {
          title: "Task with Criteria",
          type: "task",
          createdBy: "user-123",
          successCriteria: [
            { description: "First criterion" },
            { description: "Second criterion" },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.successCriteria).toHaveLength(2);
      expect(body.successCriteria[0].description).toBe("First criterion");
      expect(body.successCriteria[0].id).toBeDefined();
      expect(body.successCriteria[0].completed).toBe(false);
    });
  });

  describe("GET /work-items/:id", () => {
    it("should return 200 with work item", async () => {
      const created = await createTestWorkItem({ title: "Findable Item" });

      const response = await app.inject({
        method: "GET",
        url: `/${created.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(created.id);
      expect(body.title).toBe("Findable Item");
    });

    it("should return 404 for non-existent id", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/non-existent-id",
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Work item not found");
    });
  });

  describe("GET /work-items", () => {
    it("should return 200 with array of work items", async () => {
      await createTestWorkItem({ title: "Item 1" });
      await createTestWorkItem({ title: "Item 2" });

      const response = await app.inject({
        method: "GET",
        url: "/",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(2);
    });

    it("should return empty array when no work items exist", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual([]);
    });

    it("should filter by status query param", async () => {
      await createTestWorkItem({ title: "Backlog Item" });
      const readyItem = await createTestWorkItem({ title: "Ready Item" });
      // Transition to ready
      await app.inject({
        method: "POST",
        url: `/${readyItem.id}/transition`,
        payload: { status: "ready" },
      });

      const response = await app.inject({
        method: "GET",
        url: "/?status=ready",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.length).toBe(1);
      expect(body[0].status).toBe("ready");
    });

    it("should filter by type query param", async () => {
      await createTestWorkItem({ title: "Feature", type: "feature" });
      await createTestWorkItem({ title: "Bug", type: "bug" });
      await createTestWorkItem({ title: "Task", type: "task" });

      const response = await app.inject({
        method: "GET",
        url: "/?type=bug",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.length).toBe(1);
      expect(body[0].type).toBe("bug");
    });
  });

  // Phase 3: Update and Delete Endpoints

  describe("PATCH /work-items/:id", () => {
    it("should return 200 with updated work item", async () => {
      const created = await createTestWorkItem({ title: "Original Title" });

      const response = await app.inject({
        method: "PATCH",
        url: `/${created.id}`,
        payload: {
          title: "Updated Title",
          description: "Updated description",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.title).toBe("Updated Title");
      expect(body.description).toBe("Updated description");
    });

    it("should return 404 for non-existent id", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: "/non-existent-id",
        payload: {
          title: "Updated Title",
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it("should update linked files", async () => {
      const created = await createTestWorkItem();

      const response = await app.inject({
        method: "PATCH",
        url: `/${created.id}`,
        payload: {
          linkedFiles: ["file1.ts", "file2.ts"],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.linkedFiles).toEqual(["file1.ts", "file2.ts"]);
    });
  });

  describe("DELETE /work-items/:id", () => {
    it("should return 204 on successful delete", async () => {
      const created = await createTestWorkItem();

      const response = await app.inject({
        method: "DELETE",
        url: `/${created.id}`,
      });

      expect(response.statusCode).toBe(204);

      // Verify it's deleted
      const getResponse = await app.inject({
        method: "GET",
        url: `/${created.id}`,
      });
      expect(getResponse.statusCode).toBe(404);
    });

    it("should return 404 for non-existent id", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/non-existent-id",
      });

      expect(response.statusCode).toBe(404);
    });

    it("should return 400 when item has children", async () => {
      // Create parent
      const parent = await createTestWorkItem({ title: "Parent" });

      // Create child with parentId
      await app.inject({
        method: "POST",
        url: "/",
        payload: {
          title: "Child",
          type: "task",
          createdBy: "user-1",
          parentId: parent.id,
        },
      });

      const response = await app.inject({
        method: "DELETE",
        url: `/${parent.id}`,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("child");
    });
  });

  // Phase 4: State Transition Endpoint

  describe("POST /work-items/:id/transition", () => {
    it("should return 200 with new status", async () => {
      const created = await createTestWorkItem();
      expect(created.status).toBe("backlog");

      const response = await app.inject({
        method: "POST",
        url: `/${created.id}/transition`,
        payload: { status: "ready" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("ready");
    });

    it("should return 404 for non-existent id", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/non-existent-id/transition",
        payload: { status: "ready" },
      });

      expect(response.statusCode).toBe(404);
    });

    it("should return 400 for invalid status value", async () => {
      const created = await createTestWorkItem();

      const response = await app.inject({
        method: "POST",
        url: `/${created.id}/transition`,
        payload: { status: "invalid_status" },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return 409 for invalid transition (backlog -> done)", async () => {
      const created = await createTestWorkItem();

      const response = await app.inject({
        method: "POST",
        url: `/${created.id}/transition`,
        payload: { status: "done" },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("Invalid status transition");
    });

    it("should set startedAt timestamp on transition to in_progress", async () => {
      const created = await createTestWorkItem();
      expect(created.startedAt).toBeNull();

      // Transition to ready first
      await app.inject({
        method: "POST",
        url: `/${created.id}/transition`,
        payload: { status: "ready" },
      });

      // Then to in_progress
      const response = await app.inject({
        method: "POST",
        url: `/${created.id}/transition`,
        payload: { status: "in_progress" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("in_progress");
      expect(body.startedAt).not.toBeNull();
    });

    it("should set completedAt timestamp on transition to done", async () => {
      const created = await createTestWorkItem();

      // Go through the workflow: backlog -> ready -> in_progress -> review -> done
      await app.inject({
        method: "POST",
        url: `/${created.id}/transition`,
        payload: { status: "ready" },
      });
      await app.inject({
        method: "POST",
        url: `/${created.id}/transition`,
        payload: { status: "in_progress" },
      });
      await app.inject({
        method: "POST",
        url: `/${created.id}/transition`,
        payload: { status: "review" },
      });

      const response = await app.inject({
        method: "POST",
        url: `/${created.id}/transition`,
        payload: { status: "done" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe("done");
      expect(body.completedAt).not.toBeNull();
    });
  });

  // Phase 5: Agent Assignment and Success Criteria Endpoints

  describe("POST /work-items/:id/assign", () => {
    it("should return 200 with assigned agent", async () => {
      const created = await createTestWorkItem();

      const response = await app.inject({
        method: "POST",
        url: `/${created.id}/assign`,
        payload: {
          role: "implementer",
          agentId: "agent-123",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.assignedAgents.implementer).toBe("agent-123");
    });

    it("should return 404 for non-existent id", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/non-existent-id/assign",
        payload: {
          role: "implementer",
          agentId: "agent-123",
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it("should return 400 for invalid role", async () => {
      const created = await createTestWorkItem();

      const response = await app.inject({
        method: "POST",
        url: `/${created.id}/assign`,
        payload: {
          role: "invalid_role",
          agentId: "agent-123",
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should allow multiple agents with different roles", async () => {
      const created = await createTestWorkItem();

      await app.inject({
        method: "POST",
        url: `/${created.id}/assign`,
        payload: {
          role: "implementer",
          agentId: "agent-impl",
        },
      });

      const response = await app.inject({
        method: "POST",
        url: `/${created.id}/assign`,
        payload: {
          role: "reviewer",
          agentId: "agent-review",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.assignedAgents.implementer).toBe("agent-impl");
      expect(body.assignedAgents.reviewer).toBe("agent-review");
    });
  });

  describe("POST /work-items/:id/success-criteria", () => {
    it("should return 200 with new criterion", async () => {
      const created = await createTestWorkItem();

      const response = await app.inject({
        method: "POST",
        url: `/${created.id}/success-criteria`,
        payload: {
          description: "All tests pass",
          completed: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.successCriteria).toHaveLength(1);
      expect(body.successCriteria[0].description).toBe("All tests pass");
      expect(body.successCriteria[0].completed).toBe(false);
      expect(body.successCriteria[0].id).toBeDefined();
    });

    it("should return 404 for non-existent id", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/non-existent-id/success-criteria",
        payload: {
          description: "Criterion",
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it("should return 400 for missing description", async () => {
      const created = await createTestWorkItem();

      const response = await app.inject({
        method: "POST",
        url: `/${created.id}/success-criteria`,
        payload: {
          completed: true,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should add multiple criteria", async () => {
      const created = await createTestWorkItem();

      await app.inject({
        method: "POST",
        url: `/${created.id}/success-criteria`,
        payload: { description: "First criterion" },
      });

      const response = await app.inject({
        method: "POST",
        url: `/${created.id}/success-criteria`,
        payload: { description: "Second criterion" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.successCriteria).toHaveLength(2);
    });
  });
});
