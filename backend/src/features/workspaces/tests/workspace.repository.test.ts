import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../shared/db/schema.js";
import { WorkspaceRepository } from "../repositories/workspace.repository.js";
import type { NewWorkspace, NewWorker, NewTemplate, NewWorkItem, NewRepository as NewRepo, NewGitHubConnection } from "../../shared/db/schema.js";
import { v4 as uuidv4 } from "uuid";

describe("WorkspaceRepository", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let repository: WorkspaceRepository;
  let testWorkerId: string;
  let testWorkItemId: string;
  let testRepositoryId: string;

  beforeEach(async () => {
    // Create in-memory database for testing
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    db = drizzle(sqlite, { schema });

    // Create tables
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS github_connections (
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

      CREATE TABLE IF NOT EXISTS repositories (
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
    `);

    repository = new WorkspaceRepository(db);

    // Create test dependencies
    const now = new Date();

    // Create GitHub connection
    const connectionId = uuidv4();
    await db.insert(schema.githubConnections).values({
      id: connectionId,
      githubUserId: 12345,
      githubUsername: "testuser",
      accessToken: "test-token",
      scopes: ["repo"],
      createdAt: now,
      updatedAt: now,
    });

    // Create repository
    testRepositoryId = uuidv4();
    await db.insert(schema.repositories).values({
      id: testRepositoryId,
      connectionId: connectionId,
      githubRepoId: 67890,
      owner: "testowner",
      name: "testrepo",
      fullName: "testowner/testrepo",
      htmlUrl: "https://github.com/testowner/testrepo",
      defaultBranch: "main",
      isPrivate: false,
      syncEnabled: true,
      syncStatus: "pending",
      issueLabelsFilter: [],
      autoAssignAgents: false,
      createdAt: now,
      updatedAt: now,
    });

    // Create template
    const templateId = uuidv4();
    await db.insert(schema.templates).values({
      id: templateId,
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
    });

    // Create work item
    testWorkItemId = uuidv4();
    await db.insert(schema.workItems).values({
      id: testWorkItemId,
      title: "Test Work Item",
      type: "task",
      status: "backlog",
      description: "Test description",
      createdBy: "system",
      successCriteria: [],
      linkedFiles: [],
      assignedAgents: {},
      requiresApproval: {},
      childIds: [],
      blockedBy: [],
      createdAt: now,
      updatedAt: now,
    });

    // Create worker
    testWorkerId = uuidv4();
    await db.insert(schema.workers).values({
      id: testWorkerId,
      templateId: templateId,
      status: "idle",
      sessionId: uuidv4(),
      spawnedAt: now,
    });
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("findById", () => {
    it("should return undefined for non-existent workspace", async () => {
      const found = await repository.findById("non-existent-id");
      expect(found).toBeUndefined();
    });

    it("should find a workspace by id", async () => {
      const workspace = await repository.create({
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        repositoryId: testRepositoryId,
        path: "/tmp/workspace-1",
        status: "active",
      });

      const found = await repository.findById(workspace.id);
      expect(found).toBeTruthy();
      expect(found?.id).toBe(workspace.id);
      expect(found?.path).toBe("/tmp/workspace-1");
    });
  });

  describe("create", () => {
    it("should create a new workspace and return it", async () => {
      const workspace = await repository.create({
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        repositoryId: testRepositoryId,
        path: "/tmp/workspace-test",
        branchName: "feature/test",
        status: "active",
      });

      expect(workspace.id).toBeDefined();
      expect(workspace.path).toBe("/tmp/workspace-test");
      expect(workspace.branchName).toBe("feature/test");
      expect(workspace.status).toBe("active");
      expect(workspace.createdAt).toBeInstanceOf(Date);
    });

    it("should create workspace with minimal data", async () => {
      const workspace = await repository.create({
        path: "/tmp/minimal-workspace",
        status: "active",
      });

      expect(workspace.id).toBeDefined();
      expect(workspace.path).toBe("/tmp/minimal-workspace");
      expect(workspace.workerId).toBeNull();
    });
  });

  describe("findByWorkerId", () => {
    it("should return workspaces for a worker", async () => {
      // Create workspaces for the test worker
      await repository.create({
        workerId: testWorkerId,
        path: "/tmp/workspace-1",
        status: "active",
      });

      await repository.create({
        workerId: testWorkerId,
        path: "/tmp/workspace-2",
        status: "completed",
      });

      // Create workspace for different worker (null in this case)
      await repository.create({
        path: "/tmp/workspace-other",
        status: "active",
      });

      const workspaces = await repository.findByWorkerId(testWorkerId);
      expect(workspaces).toHaveLength(2);
      expect(workspaces.every(w => w.workerId === testWorkerId)).toBe(true);
    });

    it("should return empty array when no workspaces exist for worker", async () => {
      const workspaces = await repository.findByWorkerId("non-existent-worker");
      expect(workspaces).toEqual([]);
    });
  });

  describe("findByStatus", () => {
    it("should filter workspaces by status", async () => {
      await repository.create({
        path: "/tmp/active-1",
        status: "active",
      });

      await repository.create({
        path: "/tmp/active-2",
        status: "active",
      });

      await repository.create({
        path: "/tmp/completed-1",
        status: "completed",
      });

      const activeWorkspaces = await repository.findByStatus("active");
      expect(activeWorkspaces).toHaveLength(2);
      expect(activeWorkspaces.every(w => w.status === "active")).toBe(true);

      const completedWorkspaces = await repository.findByStatus("completed");
      expect(completedWorkspaces).toHaveLength(1);
    });
  });

  describe("updateStatus", () => {
    it("should change status and set completedAt for completed status", async () => {
      const workspace = await repository.create({
        path: "/tmp/workspace-status",
        status: "active",
      });

      const updated = await repository.updateStatus(workspace.id, "completed");
      expect(updated.status).toBe("completed");
      expect(updated.completedAt).toBeInstanceOf(Date);
    });

    it("should set cleanupAt for cleaning status", async () => {
      const workspace = await repository.create({
        path: "/tmp/workspace-cleanup",
        status: "active",
      });

      const updated = await repository.updateStatus(workspace.id, "cleaning");
      expect(updated.status).toBe("cleaning");
      expect(updated.cleanupAt).toBeInstanceOf(Date);
    });

    it("should throw error for non-existent workspace", async () => {
      await expect(
        repository.updateStatus("non-existent-id", "completed")
      ).rejects.toThrow("Workspace with id non-existent-id not found");
    });
  });

  describe("delete", () => {
    it("should remove workspace record", async () => {
      const workspace = await repository.create({
        path: "/tmp/workspace-delete",
        status: "active",
      });

      await repository.delete(workspace.id);

      const found = await repository.findById(workspace.id);
      expect(found).toBeUndefined();
    });

    it("should throw error for non-existent workspace", async () => {
      await expect(repository.delete("non-existent-id")).rejects.toThrow(
        "Workspace with id non-existent-id not found"
      );
    });
  });

  describe("update", () => {
    it("should update workspace fields", async () => {
      const workspace = await repository.create({
        path: "/tmp/workspace-update",
        status: "active",
      });

      const updated = await repository.update(workspace.id, {
        branchName: "feature/new-branch",
        status: "completed",
      });

      expect(updated.branchName).toBe("feature/new-branch");
      expect(updated.status).toBe("completed");
    });
  });

  describe("findAll", () => {
    it("should return all workspaces", async () => {
      await repository.create({ path: "/tmp/ws-1", status: "active" });
      await repository.create({ path: "/tmp/ws-2", status: "completed" });
      await repository.create({ path: "/tmp/ws-3", status: "error" });

      const all = await repository.findAll();
      expect(all).toHaveLength(3);
    });
  });
});
