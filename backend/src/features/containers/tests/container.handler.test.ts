import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../../shared/db/schema.js";
import { containerRoutes } from "../handler/container.handler.js";
import { ContainerManagerService } from "../services/container-manager.service.js";
import type { NewContainer } from "../../../shared/db/schema.js";
import { v4 as uuidv4 } from "uuid";
import type { Config } from "../../../shared/config.js";
import type {
  DockerClientInterface,
  DockerCreateContainerOptions,
  DockerExecOptions,
  DockerLogsOptions,
  DockerContainerInfo,
  DockerExecResult,
} from "../interfaces/docker-client.interface.js";
import { Readable } from "stream";

/**
 * Mock Docker client for testing
 */
class MockDockerClient implements DockerClientInterface {
  public createdContainers: Map<string, DockerCreateContainerOptions> = new Map();
  public startedContainers: Set<string> = new Set();
  public stoppedContainers: Set<string> = new Set();
  public removedContainers: Set<string> = new Set();
  public containerInfoMap: Map<string, DockerContainerInfo> = new Map();

  async createContainer(options: DockerCreateContainerOptions): Promise<string> {
    const containerId = `mock-container-${uuidv4()}`;
    this.createdContainers.set(containerId, options);

    // Create mock container info
    this.containerInfoMap.set(containerId, {
      Id: containerId,
      Name: options.name,
      State: {
        Status: "created",
        Running: false,
        Paused: false,
        Restarting: false,
        OOMKilled: false,
        Dead: false,
        Pid: 0,
        ExitCode: 0,
        Error: "",
        StartedAt: "",
        FinishedAt: "",
      },
      Config: {
        Image: options.Image,
        Env: options.Env || [],
      },
    });

    return containerId;
  }

  async startContainer(containerId: string): Promise<void> {
    if (!this.containerInfoMap.has(containerId)) {
      throw new Error(`Container ${containerId} not found`);
    }
    this.startedContainers.add(containerId);

    // Update state
    const info = this.containerInfoMap.get(containerId)!;
    info.State.Status = "running";
    info.State.Running = true;
    info.State.StartedAt = new Date().toISOString();
  }

  async stopContainer(containerId: string, timeout?: number): Promise<void> {
    if (!this.containerInfoMap.has(containerId)) {
      throw new Error(`Container ${containerId} not found`);
    }
    this.stoppedContainers.add(containerId);

    // Update state
    const info = this.containerInfoMap.get(containerId)!;
    info.State.Status = "exited";
    info.State.Running = false;
    info.State.FinishedAt = new Date().toISOString();
  }

  async removeContainer(containerId: string, force?: boolean): Promise<void> {
    if (!this.containerInfoMap.has(containerId)) {
      throw new Error(`Container ${containerId} not found`);
    }
    this.removedContainers.add(containerId);
    this.containerInfoMap.delete(containerId);
  }

  async getContainer(containerId: string): Promise<DockerContainerInfo> {
    const info = this.containerInfoMap.get(containerId);
    if (!info) {
      throw new Error(`Container ${containerId} not found`);
    }
    return info;
  }

  async listContainers(all?: boolean): Promise<DockerContainerInfo[]> {
    return Array.from(this.containerInfoMap.values());
  }

  async exec(
    containerId: string,
    options: DockerExecOptions
  ): Promise<DockerExecResult> {
    if (!this.containerInfoMap.has(containerId)) {
      throw new Error(`Container ${containerId} not found`);
    }
    return {
      exitCode: 0,
      stdout: "mock output",
      stderr: "",
    };
  }

  async getLogs(
    containerId: string,
    options?: DockerLogsOptions
  ): Promise<Readable> {
    if (!this.containerInfoMap.has(containerId)) {
      throw new Error(`Container ${containerId} not found`);
    }
    const stream = new Readable({
      read() {
        this.push("mock log line\n");
        this.push(null);
      },
    });
    return stream;
  }
}

describe("ContainerHandler", () => {
  let app: FastifyInstance;
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let mockConfig: Config;
  let mockDockerClient: MockDockerClient;
  let containerService: ContainerManagerService;

  beforeEach(async () => {
    // Create in-memory database
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    db = drizzle(sqlite, { schema });

    // Create tables
    sqlite.exec(`
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
        stopped_at INTEGER
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
        cleanup_at INTEGER
      );
    `);

    // Mock config
    mockConfig = {
      port: 3000,
      host: "localhost",
      isDevelopment: true,
      githubAppId: "test-app-id",
      githubAppPrivateKey: "test-key",
      githubWebhookSecret: "test-secret",
      maxWorkersPerRepo: 5,
      maxWorkersPerUser: 10,
    } as Config;

    // Initialize mock Docker client and container service
    mockDockerClient = new MockDockerClient();
    containerService = new ContainerManagerService(db, mockDockerClient);

    // Initialize Fastify app with plugin
    app = Fastify();
    await app.register(containerRoutes, {
      prefix: "/api/containers",
      db,
      config: mockConfig,
      containerService,
    });
  });

  afterEach(async () => {
    await app.close();
    sqlite.close();
  });

  describe("GET /api/containers", () => {
    it("returns empty list when no containers exist", async () => {
      // Act: GET all containers
      const response = await app.inject({
        method: "GET",
        url: "/api/containers",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual([]);
    });

    it("returns list of containers", async () => {
      // Arrange: Create containers
      const containers: NewContainer[] = [
        {
          id: uuidv4(),
          containerId: "docker-123",
          name: "test-container-1",
          image: "node:20-alpine",
          status: "running",
          createdAt: new Date(),
        },
        {
          id: uuidv4(),
          containerId: "docker-456",
          name: "test-container-2",
          image: "python:3.11",
          status: "stopped",
          createdAt: new Date(),
        },
      ];
      await db.insert(schema.containers).values(containers);

      // Act: GET all containers
      const response = await app.inject({
        method: "GET",
        url: "/api/containers",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(2);
      expect(body[0].name).toBe("test-container-1");
      expect(body[1].name).toBe("test-container-2");
    });
  });

  describe("GET /api/containers/:id", () => {
    it("returns single container by ID", async () => {
      // Arrange: Create container
      const containerId = uuidv4();
      const container: NewContainer = {
        id: containerId,
        containerId: "docker-789",
        name: "test-container",
        image: "node:20-alpine",
        status: "running",
        createdAt: new Date(),
      };
      await db.insert(schema.containers).values(container);

      // Act: GET by ID
      const response = await app.inject({
        method: "GET",
        url: `/api/containers/${containerId}`,
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(containerId);
      expect(body.name).toBe("test-container");
      expect(body.status).toBe("running");
    });

    it("returns 404 for non-existent container", async () => {
      // Act: GET non-existent ID
      const response = await app.inject({
        method: "GET",
        url: "/api/containers/non-existent-id",
      });

      // Assert
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Container not found");
    });
  });

  describe("POST /api/containers", () => {
    it("creates new container with valid data", async () => {
      // Arrange: Prepare valid request body
      const requestBody = {
        image: "node:20-alpine",
        name: "new-container",
      };

      // Act: POST to create container
      const response = await app.inject({
        method: "POST",
        url: "/api/containers",
        payload: requestBody,
      });

      // Assert
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.name).toBe("new-container");
      expect(body.image).toBe("node:20-alpine");
      expect(body.status).toBe("creating");
    });

    it("creates container with optional fields", async () => {
      // Arrange: Create a workspace first
      const workspaceId = uuidv4();
      await db.insert(schema.workspaces).values({
        id: workspaceId,
        path: "/tmp/test-workspace",
        status: "active",
        createdAt: new Date(),
      });

      // Prepare request with optional fields
      const requestBody = {
        image: "python:3.11",
        name: "python-container",
        workspaceId,
        executionId: uuidv4(),
        resourceLimits: {
          cpuLimit: 1.0,
          memoryLimit: 1073741824, // 1GB
        },
      };

      // Act: POST to create container
      const response = await app.inject({
        method: "POST",
        url: "/api/containers",
        payload: requestBody,
      });

      // Assert
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.name).toBe("python-container");
      expect(body.image).toBe("python:3.11");
    });

    it("returns 400 for invalid data (missing image)", async () => {
      // Arrange: Invalid request body (missing image)
      const requestBody = {
        name: "invalid-container",
      };

      // Act: POST with invalid data
      const response = await app.inject({
        method: "POST",
        url: "/api/containers",
        payload: requestBody,
      });

      // Assert
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });

    it("returns 400 for invalid data (missing name)", async () => {
      // Arrange: Invalid request body (missing name)
      const requestBody = {
        image: "node:20-alpine",
      };

      // Act: POST with invalid data
      const response = await app.inject({
        method: "POST",
        url: "/api/containers",
        payload: requestBody,
      });

      // Assert
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });
  });

  describe("POST /api/containers/:id/start", () => {
    it("starts a container successfully", async () => {
      // Arrange: Create a stopped container
      const containerId = uuidv4();
      const dockerContainerId = "docker-start-123";

      // Register container in mock Docker client first
      mockDockerClient.containerInfoMap.set(dockerContainerId, {
        Id: dockerContainerId,
        Name: "start-test-container",
        State: {
          Status: "created",
          Running: false,
          Paused: false,
          Restarting: false,
          OOMKilled: false,
          Dead: false,
          Pid: 0,
          ExitCode: 0,
          Error: "",
          StartedAt: "",
          FinishedAt: "",
        },
        Config: {
          Image: "node:20-alpine",
          Env: [],
        },
      });

      const container: NewContainer = {
        id: containerId,
        containerId: dockerContainerId,
        name: "start-test-container",
        image: "node:20-alpine",
        status: "creating",
        createdAt: new Date(),
      };
      await db.insert(schema.containers).values(container);

      // Act: POST to start container
      const response = await app.inject({
        method: "POST",
        url: `/api/containers/${containerId}/start`,
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(containerId);
      expect(body.status).toBe("running");
      expect(body.startedAt).toBeDefined();
    });

    it("returns 404 for non-existent container", async () => {
      // Act: POST to start non-existent container
      const response = await app.inject({
        method: "POST",
        url: "/api/containers/non-existent-id/start",
      });

      // Assert
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Container not found");
    });
  });

  describe("POST /api/containers/:id/stop", () => {
    it("stops a running container with default timeout", async () => {
      // Arrange: Create a running container
      const containerId = uuidv4();
      const dockerContainerId = "docker-stop-123";

      // Register container in mock Docker client first
      mockDockerClient.containerInfoMap.set(dockerContainerId, {
        Id: dockerContainerId,
        Name: "stop-test-container",
        State: {
          Status: "running",
          Running: true,
          Paused: false,
          Restarting: false,
          OOMKilled: false,
          Dead: false,
          Pid: 1234,
          ExitCode: 0,
          Error: "",
          StartedAt: new Date().toISOString(),
          FinishedAt: "",
        },
        Config: {
          Image: "node:20-alpine",
          Env: [],
        },
      });

      const container: NewContainer = {
        id: containerId,
        containerId: dockerContainerId,
        name: "stop-test-container",
        image: "node:20-alpine",
        status: "running",
        createdAt: new Date(),
        startedAt: new Date(),
      };
      await db.insert(schema.containers).values(container);

      // Act: POST to stop container
      const response = await app.inject({
        method: "POST",
        url: `/api/containers/${containerId}/stop`,
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(containerId);
      expect(body.status).toBe("stopped");
      expect(body.stoppedAt).toBeDefined();
    });

    it("stops a container with custom timeout", async () => {
      // Arrange: Create a running container
      const containerId = uuidv4();
      const dockerContainerId = "docker-stop-456";

      // Register container in mock Docker client first
      mockDockerClient.containerInfoMap.set(dockerContainerId, {
        Id: dockerContainerId,
        Name: "stop-test-container-2",
        State: {
          Status: "running",
          Running: true,
          Paused: false,
          Restarting: false,
          OOMKilled: false,
          Dead: false,
          Pid: 5678,
          ExitCode: 0,
          Error: "",
          StartedAt: new Date().toISOString(),
          FinishedAt: "",
        },
        Config: {
          Image: "python:3.11",
          Env: [],
        },
      });

      const container: NewContainer = {
        id: containerId,
        containerId: dockerContainerId,
        name: "stop-test-container-2",
        image: "python:3.11",
        status: "running",
        createdAt: new Date(),
        startedAt: new Date(),
      };
      await db.insert(schema.containers).values(container);

      // Act: POST to stop container with custom timeout
      const response = await app.inject({
        method: "POST",
        url: `/api/containers/${containerId}/stop`,
        payload: { timeout: 30 },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(containerId);
      expect(body.status).toBe("stopped");
    });

    it("returns 404 for non-existent container", async () => {
      // Act: POST to stop non-existent container
      const response = await app.inject({
        method: "POST",
        url: "/api/containers/non-existent-id/stop",
      });

      // Assert
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Container not found");
    });
  });

  describe("DELETE /api/containers/:id", () => {
    it("removes a stopped container", async () => {
      // Arrange: Create a stopped container
      const containerId = uuidv4();
      const dockerContainerId = "docker-remove-123";

      // Register container in mock Docker client first
      mockDockerClient.containerInfoMap.set(dockerContainerId, {
        Id: dockerContainerId,
        Name: "remove-test-container",
        State: {
          Status: "exited",
          Running: false,
          Paused: false,
          Restarting: false,
          OOMKilled: false,
          Dead: false,
          Pid: 0,
          ExitCode: 0,
          Error: "",
          StartedAt: new Date().toISOString(),
          FinishedAt: new Date().toISOString(),
        },
        Config: {
          Image: "node:20-alpine",
          Env: [],
        },
      });

      const container: NewContainer = {
        id: containerId,
        containerId: dockerContainerId,
        name: "remove-test-container",
        image: "node:20-alpine",
        status: "stopped",
        createdAt: new Date(),
        stoppedAt: new Date(),
      };
      await db.insert(schema.containers).values(container);

      // Act: DELETE container
      const response = await app.inject({
        method: "DELETE",
        url: `/api/containers/${containerId}`,
      });

      // Assert
      expect(response.statusCode).toBe(204);

      // Verify container is removed from database
      const checkResponse = await app.inject({
        method: "GET",
        url: `/api/containers/${containerId}`,
      });
      expect(checkResponse.statusCode).toBe(404);
    });

    it("returns 404 for non-existent container", async () => {
      // Act: DELETE non-existent container
      const response = await app.inject({
        method: "DELETE",
        url: "/api/containers/non-existent-id",
      });

      // Assert
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Container not found");
    });
  });
});
