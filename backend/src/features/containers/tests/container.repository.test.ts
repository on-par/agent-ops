import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../../shared/db/schema.js";
import { ContainerRepository } from "../repositories/container.repository.js";
import type {
  NewContainer,
  NewWorkspace,
  NewAgentExecution,
  NewWorker,
  NewTemplate,
} from "../../../shared/db/schema.js";
import { v4 as uuidv4 } from "uuid";

describe("ContainerRepository", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let repository: ContainerRepository;
  let testWorkspaceId: string;
  let testExecutionId: string;
  let testWorkerId: string;

  beforeEach(async () => {
    // Create in-memory database for testing
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    db = drizzle(sqlite, { schema });

    // Create tables manually (since we don't have migration files in test)
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
        github_pr_number INTEGER,
        github_pr_url TEXT,
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
        FOREIGN KEY (work_item_id) REFERENCES work_items(id),
        FOREIGN KEY (repository_id) REFERENCES repositories(id)
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
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY (template_id) REFERENCES templates(id)
      );

      CREATE TABLE IF NOT EXISTS containers (
        id TEXT PRIMARY KEY,
        container_id TEXT NOT NULL UNIQUE,
        workspace_id TEXT,
        worker_id TEXT,
        execution_id TEXT,
        image TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'creating',
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        stopped_at INTEGER,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY (worker_id) REFERENCES workers(id),
        FOREIGN KEY (execution_id) REFERENCES agent_executions(id)
      );
    `);

    repository = new ContainerRepository(db);

    // Create test dependencies for foreign key constraints
    const now = new Date();
    const testTemplateId = uuidv4();

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

    await db.insert(schema.templates).values(testTemplate);

    testWorkerId = uuidv4();
    const testWorker: NewWorker = {
      id: testWorkerId,
      templateId: testTemplateId,
      status: "idle",
      sessionId: uuidv4(),
      spawnedAt: now,
    };

    await db.insert(schema.workers).values(testWorker);

    testWorkspaceId = uuidv4();
    const testWorkspace: NewWorkspace = {
      id: testWorkspaceId,
      path: "/tmp/test-workspace",
      status: "active",
      createdAt: now,
    };

    await db.insert(schema.workspaces).values(testWorkspace);

    testExecutionId = uuidv4();
    const testExecution: NewAgentExecution = {
      id: testExecutionId,
      workspaceId: testWorkspaceId,
      status: "pending",
      createdAt: now,
    };

    await db.insert(schema.agentExecutions).values(testExecution);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("create", () => {
    it("should create a new container with required fields", async () => {
      const newContainer: NewContainer = {
        id: uuidv4(),
        containerId: `docker-${uuidv4()}`,
        name: "test-container",
        image: "node:20-alpine",
        status: "creating",
        createdAt: new Date(),
      };

      const container = await repository.create(newContainer);

      expect(container).toMatchObject(newContainer);
      expect(container.id).toBe(newContainer.id);
      expect(container.containerId).toBe(newContainer.containerId);
      expect(container.name).toBe(newContainer.name);
      expect(container.image).toBe(newContainer.image);
      expect(container.status).toBe("creating");
    });

    it("should create container with workspace, worker, and execution references", async () => {
      const newContainer: NewContainer = {
        id: uuidv4(),
        containerId: `docker-${uuidv4()}`,
        name: "test-container-with-refs",
        image: "node:20-alpine",
        status: "running",
        workspaceId: testWorkspaceId,
        workerId: testWorkerId,
        executionId: testExecutionId,
        createdAt: new Date(),
      };

      const container = await repository.create(newContainer);

      expect(container.workspaceId).toBe(testWorkspaceId);
      expect(container.workerId).toBe(testWorkerId);
      expect(container.executionId).toBe(testExecutionId);
    });

    it("should return created container with id", async () => {
      const containerId = uuidv4();
      const newContainer: NewContainer = {
        id: containerId,
        containerId: `docker-${uuidv4()}`,
        name: "test-container",
        image: "node:20-alpine",
        status: "creating",
        createdAt: new Date(),
      };

      const container = await repository.create(newContainer);

      expect(container.id).toBe(containerId);
      expect(container).toHaveProperty("containerId");
      expect(container).toHaveProperty("createdAt");
    });

    it("should handle duplicate containerId", async () => {
      const dockerContainerId = `docker-${uuidv4()}`;

      const container1: NewContainer = {
        id: uuidv4(),
        containerId: dockerContainerId,
        name: "container-1",
        image: "node:20-alpine",
        status: "creating",
        createdAt: new Date(),
      };

      await repository.create(container1);

      const container2: NewContainer = {
        id: uuidv4(),
        containerId: dockerContainerId, // Same Docker container ID
        name: "container-2",
        image: "node:20-alpine",
        status: "creating",
        createdAt: new Date(),
      };

      // Should throw due to unique constraint on containerId
      await expect(repository.create(container2)).rejects.toThrow();
    });
  });

  describe("findById", () => {
    it("should find a container by id", async () => {
      const newContainer: NewContainer = {
        id: uuidv4(),
        containerId: `docker-${uuidv4()}`,
        name: "test-container",
        image: "node:20-alpine",
        status: "running",
        createdAt: new Date(),
      };

      await repository.create(newContainer);
      const found = await repository.findById(newContainer.id);

      expect(found).toBeTruthy();
      expect(found?.id).toBe(newContainer.id);
    });

    it("should return null for non-existent container", async () => {
      const found = await repository.findById("non-existent-id");
      expect(found).toBeNull();
    });
  });

  describe("findByContainerId", () => {
    it("should find container by Docker container ID", async () => {
      const dockerContainerId = `docker-${uuidv4()}`;
      const newContainer: NewContainer = {
        id: uuidv4(),
        containerId: dockerContainerId,
        name: "test-container",
        image: "node:20-alpine",
        status: "running",
        createdAt: new Date(),
      };

      await repository.create(newContainer);
      const found = await repository.findByContainerId(dockerContainerId);

      expect(found).toBeTruthy();
      expect(found?.containerId).toBe(dockerContainerId);
    });

    it("should return null for non-existent Docker container ID", async () => {
      const found = await repository.findByContainerId("non-existent-docker-id");
      expect(found).toBeNull();
    });
  });

  describe("findAll", () => {
    it("should return all containers", async () => {
      const container1: NewContainer = {
        id: uuidv4(),
        containerId: `docker-${uuidv4()}`,
        name: "container-1",
        image: "node:20-alpine",
        status: "running",
        createdAt: new Date(),
      };

      const container2: NewContainer = {
        id: uuidv4(),
        containerId: `docker-${uuidv4()}`,
        name: "container-2",
        image: "python:3.11-slim",
        status: "stopped",
        createdAt: new Date(),
      };

      await repository.create(container1);
      await repository.create(container2);

      const containers = await repository.findAll();

      expect(containers).toHaveLength(2);
      expect(containers.map((c) => c.id)).toContain(container1.id);
      expect(containers.map((c) => c.id)).toContain(container2.id);
    });

    it("should return empty array when no containers exist", async () => {
      const containers = await repository.findAll();
      expect(containers).toEqual([]);
    });
  });

  describe("findByStatus", () => {
    it("should find containers by status", async () => {
      const container1: NewContainer = {
        id: uuidv4(),
        containerId: `docker-${uuidv4()}`,
        name: "running-container-1",
        image: "node:20-alpine",
        status: "running",
        createdAt: new Date(),
      };

      const container2: NewContainer = {
        id: uuidv4(),
        containerId: `docker-${uuidv4()}`,
        name: "stopped-container",
        image: "python:3.11-slim",
        status: "stopped",
        createdAt: new Date(),
      };

      const container3: NewContainer = {
        id: uuidv4(),
        containerId: `docker-${uuidv4()}`,
        name: "running-container-2",
        image: "node:18-alpine",
        status: "running",
        createdAt: new Date(),
      };

      await repository.create(container1);
      await repository.create(container2);
      await repository.create(container3);

      const runningContainers = await repository.findByStatus("running");
      expect(runningContainers).toHaveLength(2);

      const stoppedContainers = await repository.findByStatus("stopped");
      expect(stoppedContainers).toHaveLength(1);

      const errorContainers = await repository.findByStatus("error");
      expect(errorContainers).toHaveLength(0);
    });
  });

  describe("findByWorkspaceId", () => {
    it("should find containers by workspace ID", async () => {
      const container1: NewContainer = {
        id: uuidv4(),
        containerId: `docker-${uuidv4()}`,
        name: "workspace-container",
        image: "node:20-alpine",
        status: "running",
        workspaceId: testWorkspaceId,
        createdAt: new Date(),
      };

      const container2: NewContainer = {
        id: uuidv4(),
        containerId: `docker-${uuidv4()}`,
        name: "no-workspace-container",
        image: "node:20-alpine",
        status: "running",
        createdAt: new Date(),
      };

      await repository.create(container1);
      await repository.create(container2);

      const workspaceContainers = await repository.findByWorkspaceId(
        testWorkspaceId
      );
      expect(workspaceContainers).toHaveLength(1);
      expect(workspaceContainers[0]?.id).toBe(container1.id);
    });

    it("should return empty array when no containers for workspace", async () => {
      const containers = await repository.findByWorkspaceId("non-existent-workspace");
      expect(containers).toEqual([]);
    });
  });

  describe("findByExecutionId", () => {
    it("should find containers by execution ID", async () => {
      const container1: NewContainer = {
        id: uuidv4(),
        containerId: `docker-${uuidv4()}`,
        name: "execution-container",
        image: "node:20-alpine",
        status: "running",
        executionId: testExecutionId,
        createdAt: new Date(),
      };

      const container2: NewContainer = {
        id: uuidv4(),
        containerId: `docker-${uuidv4()}`,
        name: "no-execution-container",
        image: "node:20-alpine",
        status: "running",
        createdAt: new Date(),
      };

      await repository.create(container1);
      await repository.create(container2);

      const executionContainers = await repository.findByExecutionId(
        testExecutionId
      );
      expect(executionContainers).toHaveLength(1);
      expect(executionContainers[0]?.id).toBe(container1.id);
    });

    it("should return empty array when no containers for execution", async () => {
      const containers = await repository.findByExecutionId("non-existent-execution");
      expect(containers).toEqual([]);
    });
  });

  describe("updateStatus", () => {
    it("should update container status", async () => {
      const newContainer: NewContainer = {
        id: uuidv4(),
        containerId: `docker-${uuidv4()}`,
        name: "test-container",
        image: "node:20-alpine",
        status: "creating",
        createdAt: new Date(),
      };

      await repository.create(newContainer);

      const updated = await repository.updateStatus(newContainer.id, "running");

      expect(updated.status).toBe("running");
      expect(updated.id).toBe(newContainer.id);
    });

    it("should handle status transitions", async () => {
      const newContainer: NewContainer = {
        id: uuidv4(),
        containerId: `docker-${uuidv4()}`,
        name: "test-container",
        image: "node:20-alpine",
        status: "creating",
        createdAt: new Date(),
      };

      await repository.create(newContainer);

      // creating -> running
      let updated = await repository.updateStatus(newContainer.id, "running");
      expect(updated.status).toBe("running");

      // running -> stopped
      updated = await repository.updateStatus(newContainer.id, "stopped");
      expect(updated.status).toBe("stopped");

      // stopped -> removing
      updated = await repository.updateStatus(newContainer.id, "removing");
      expect(updated.status).toBe("removing");
    });

    it("should throw error when container not found", async () => {
      await expect(
        repository.updateStatus("non-existent-id", "running")
      ).rejects.toThrow("Container with id non-existent-id not found");
    });
  });

  describe("update", () => {
    it("should update container fields", async () => {
      const newContainer: NewContainer = {
        id: uuidv4(),
        containerId: `docker-${uuidv4()}`,
        name: "test-container",
        image: "node:20-alpine",
        status: "creating",
        createdAt: new Date(),
      };

      await repository.create(newContainer);

      const startedAt = new Date();
      const updated = await repository.update(newContainer.id, {
        status: "running",
        startedAt,
        workspaceId: testWorkspaceId,
      });

      expect(updated.status).toBe("running");
      expect(updated.startedAt).toEqual(startedAt);
      expect(updated.workspaceId).toBe(testWorkspaceId);
    });

    it("should update stopped timestamp", async () => {
      const newContainer: NewContainer = {
        id: uuidv4(),
        containerId: `docker-${uuidv4()}`,
        name: "test-container",
        image: "node:20-alpine",
        status: "running",
        createdAt: new Date(),
        startedAt: new Date(),
      };

      await repository.create(newContainer);

      const stoppedAt = new Date();
      const updated = await repository.update(newContainer.id, {
        status: "stopped",
        stoppedAt,
      });

      expect(updated.status).toBe("stopped");
      expect(updated.stoppedAt).toEqual(stoppedAt);
    });

    it("should throw error when updating non-existent container", async () => {
      await expect(
        repository.update("non-existent-id", { status: "running" })
      ).rejects.toThrow("Container with id non-existent-id not found");
    });
  });

  describe("delete", () => {
    it("should delete a container", async () => {
      const newContainer: NewContainer = {
        id: uuidv4(),
        containerId: `docker-${uuidv4()}`,
        name: "test-container",
        image: "node:20-alpine",
        status: "stopped",
        createdAt: new Date(),
      };

      await repository.create(newContainer);
      await repository.delete(newContainer.id);

      const found = await repository.findById(newContainer.id);
      expect(found).toBeNull();
    });

    it("should throw error when deleting non-existent container", async () => {
      await expect(repository.delete("non-existent-id")).rejects.toThrow(
        "Container with id non-existent-id not found"
      );
    });
  });
});
