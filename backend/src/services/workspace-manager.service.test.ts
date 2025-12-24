import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import { WorkspaceManagerService } from "./workspace-manager.service.js";
import { v4 as uuidv4 } from "uuid";
import { existsSync } from "fs";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("WorkspaceManagerService", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: WorkspaceManagerService;
  let testBaseDir: string;
  let testWorkerId: string;
  let testWorkItemId: string;
  let testRepositoryId: string;

  beforeEach(async () => {
    // Create unique test base directory
    testBaseDir = join(tmpdir(), `workspace-test-${Date.now()}`);
    await mkdir(testBaseDir, { recursive: true });

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

    service = new WorkspaceManagerService(db, { baseDir: testBaseDir });

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

  afterEach(async () => {
    sqlite.close();
    // Cleanup test directory
    try {
      await rm(testBaseDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("createWorkspace", () => {
    it("should create temp directory and database record", async () => {
      const workspace = await service.createWorkspace(
        testWorkerId,
        testWorkItemId,
        testRepositoryId
      );

      expect(workspace.id).toBeDefined();
      expect(workspace.path).toContain("agent-workspace-");
      expect(workspace.workerId).toBe(testWorkerId);
      expect(workspace.workItemId).toBe(testWorkItemId);
      expect(workspace.repositoryId).toBe(testRepositoryId);
      expect(existsSync(workspace.path)).toBe(true);
    });

    it("should set workspace status to active", async () => {
      const workspace = await service.createWorkspace();

      expect(workspace.status).toBe("active");
    });

    it("should create workspace with optional parameters", async () => {
      const workspace = await service.createWorkspace();

      expect(workspace.workerId).toBeNull();
      expect(workspace.workItemId).toBeNull();
      expect(workspace.repositoryId).toBeNull();
      expect(existsSync(workspace.path)).toBe(true);
    });
  });

  describe("getWorkspace", () => {
    it("should return workspace by id", async () => {
      const created = await service.createWorkspace(testWorkerId);

      const found = await service.getWorkspace(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.workerId).toBe(testWorkerId);
    });

    it("should return undefined for non-existent workspace", async () => {
      const found = await service.getWorkspace("non-existent-id");
      expect(found).toBeUndefined();
    });
  });

  describe("getWorkspacePath", () => {
    it("should return filesystem path for workspace", async () => {
      const workspace = await service.createWorkspace();

      const path = await service.getWorkspacePath(workspace.id);

      expect(path).toBe(workspace.path);
      expect(existsSync(path)).toBe(true);
    });

    it("should throw error for non-existent workspace", async () => {
      await expect(service.getWorkspacePath("non-existent-id")).rejects.toThrow(
        "Workspace with id non-existent-id not found"
      );
    });
  });

  describe("cleanupWorkspace", () => {
    it("should remove directory and set status to cleaning", async () => {
      const workspace = await service.createWorkspace();
      expect(existsSync(workspace.path)).toBe(true);

      await service.cleanupWorkspace(workspace.id);

      // Directory should be removed
      expect(existsSync(workspace.path)).toBe(false);

      // Status should be cleaning
      const updated = await service.getWorkspace(workspace.id);
      expect(updated?.status).toBe("cleaning");
      expect(updated?.cleanupAt).toBeInstanceOf(Date);
    });

    it("should handle already-deleted directories", async () => {
      const workspace = await service.createWorkspace();

      // Manually delete the directory
      await rm(workspace.path, { recursive: true, force: true });

      // Should not throw
      await expect(service.cleanupWorkspace(workspace.id)).resolves.not.toThrow();
    });

    it("should throw error for non-existent workspace", async () => {
      await expect(service.cleanupWorkspace("non-existent-id")).rejects.toThrow(
        "Workspace with id non-existent-id not found"
      );
    });
  });

  describe("listActiveWorkspaces", () => {
    it("should return only active workspaces", async () => {
      const ws1 = await service.createWorkspace();
      const ws2 = await service.createWorkspace();
      const ws3 = await service.createWorkspace();

      // Mark one as completed
      await service.updateStatus(ws2.id, "completed");

      const active = await service.listActiveWorkspaces();

      expect(active).toHaveLength(2);
      expect(active.map((w) => w.id)).toContain(ws1.id);
      expect(active.map((w) => w.id)).toContain(ws3.id);
      expect(active.map((w) => w.id)).not.toContain(ws2.id);
    });
  });

  describe("cleanupStaleWorkspaces", () => {
    it("should cleanup workspaces older than threshold", async () => {
      // Create workspace and manually set old createdAt
      const workspace = await service.createWorkspace();

      // Update the createdAt to be old (2 hours ago)
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      sqlite.exec(
        `UPDATE workspaces SET created_at = ${twoHoursAgo.getTime()} WHERE id = '${workspace.id}'`
      );

      // Create a new workspace that should not be cleaned
      const newWorkspace = await service.createWorkspace();

      // Cleanup with 1 hour threshold
      const cleaned = await service.cleanupStaleWorkspaces(60 * 60 * 1000);

      expect(cleaned).toBe(1);

      // Old workspace should be cleaned
      const oldWs = await service.getWorkspace(workspace.id);
      expect(oldWs?.status).toBe("cleaning");

      // New workspace should still be active
      const newWs = await service.getWorkspace(newWorkspace.id);
      expect(newWs?.status).toBe("active");
    });

    it("should return 0 when no stale workspaces exist", async () => {
      await service.createWorkspace();

      const cleaned = await service.cleanupStaleWorkspaces(60 * 60 * 1000);

      expect(cleaned).toBe(0);
    });
  });

  describe("updateStatus", () => {
    it("should update workspace status", async () => {
      const workspace = await service.createWorkspace();

      const updated = await service.updateStatus(workspace.id, "completed");

      expect(updated.status).toBe("completed");
      expect(updated.completedAt).toBeInstanceOf(Date);
    });
  });

  describe("updateBranchName", () => {
    it("should update workspace branch name", async () => {
      const workspace = await service.createWorkspace();

      const updated = await service.updateBranchName(
        workspace.id,
        "feature/test-branch"
      );

      expect(updated.branchName).toBe("feature/test-branch");
    });
  });

  describe("findByWorkerId", () => {
    it("should find workspaces by worker ID", async () => {
      await service.createWorkspace(testWorkerId);
      await service.createWorkspace(testWorkerId);
      await service.createWorkspace(); // No worker

      const workspaces = await service.findByWorkerId(testWorkerId);

      expect(workspaces).toHaveLength(2);
      expect(workspaces.every((w) => w.workerId === testWorkerId)).toBe(true);
    });
  });
});
