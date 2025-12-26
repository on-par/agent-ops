import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../../shared/db/schema.js";
import { ContainerManagerService } from "../services/container-manager.service.js";
import type {
  DockerClientInterface,
  DockerCreateContainerOptions,
  DockerExecOptions,
  DockerLogsOptions,
  DockerContainerInfo,
  DockerExecResult,
} from "../interfaces/docker-client.interface.js";
import type { NewWorkspace } from "../../../shared/db/schema.js";
import { v4 as uuidv4 } from "uuid";
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
    const containers = Array.from(this.containerInfoMap.values());
    if (all) {
      return containers;
    }
    return containers.filter((c) => c.State.Running);
  }

  async exec(containerId: string, options: DockerExecOptions): Promise<DockerExecResult> {
    if (!this.containerInfoMap.has(containerId)) {
      throw new Error(`Container ${containerId} not found`);
    }

    // Mock execution result
    return {
      exitCode: 0,
      stdout: "Command executed successfully",
      stderr: "",
    };
  }

  async getLogs(containerId: string, options?: DockerLogsOptions): Promise<Readable> {
    if (!this.containerInfoMap.has(containerId)) {
      throw new Error(`Container ${containerId} not found`);
    }

    // Create a mock readable stream
    const stream = new Readable({
      read() {
        this.push("Log line 1\n");
        this.push("Log line 2\n");
        this.push(null); // End of stream
      },
    });

    return stream;
  }
}

describe("ContainerManagerService", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: ContainerManagerService;
  let mockDockerClient: MockDockerClient;
  let testWorkspaceId: string;

  beforeEach(async () => {
    // Create in-memory database for testing
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    db = drizzle(sqlite, { schema });

    // Create tables
    sqlite.exec(`
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
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      );
    `);

    // Create test workspace
    testWorkspaceId = uuidv4();
    const testWorkspace: NewWorkspace = {
      id: testWorkspaceId,
      path: "/tmp/test-workspace",
      status: "active",
      createdAt: new Date(),
    };
    await db.insert(schema.workspaces).values(testWorkspace);

    // Create service with mock Docker client
    mockDockerClient = new MockDockerClient();
    service = new ContainerManagerService(db, mockDockerClient);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("createContainer", () => {
    it("should create a Docker container with correct image and name", async () => {
      // Arrange
      const options = {
        image: "node:20-alpine",
        name: "test-container",
        workspaceId: testWorkspaceId,
      };

      // Act
      const container = await service.createContainer(options);

      // Assert
      expect(container.image).toBe("node:20-alpine");
      expect(container.name).toBe("test-container");
      expect(container.status).toBe("creating");
      expect(container.workspaceId).toBe(testWorkspaceId);

      // Verify Docker container was created
      expect(mockDockerClient.createdContainers.size).toBe(1);
      const dockerOptions = Array.from(mockDockerClient.createdContainers.values())[0];
      expect(dockerOptions?.Image).toBe("node:20-alpine");
      expect(dockerOptions?.name).toBe("test-container");
    });

    it("should mount workspace directory to container", async () => {
      // Arrange
      const options = {
        image: "node:20-alpine",
        name: "test-container",
        workspaceId: testWorkspaceId,
      };

      // Act
      await service.createContainer(options);

      // Assert
      const dockerOptions = Array.from(mockDockerClient.createdContainers.values())[0];
      expect(dockerOptions?.HostConfig?.Binds).toBeDefined();
      expect(dockerOptions?.HostConfig?.Binds).toContain("/tmp/test-workspace:/workspace");
    });

    it("should apply CPU resource limits", async () => {
      // Arrange
      const options = {
        image: "node:20-alpine",
        name: "test-container",
        resourceLimits: {
          cpuLimit: 1.5, // 1.5 cores
        },
      };

      // Act
      await service.createContainer(options);

      // Assert
      const dockerOptions = Array.from(mockDockerClient.createdContainers.values())[0];
      // 1.5 cores = 1.5 * 1000000000 nanocpus = 1500000000
      expect(dockerOptions?.HostConfig?.NanoCpus).toBe(1500000000);
    });

    it("should apply memory resource limits", async () => {
      // Arrange
      const options = {
        image: "node:20-alpine",
        name: "test-container",
        resourceLimits: {
          memoryLimit: 536870912, // 512MB in bytes
        },
      };

      // Act
      await service.createContainer(options);

      // Assert
      const dockerOptions = Array.from(mockDockerClient.createdContainers.values())[0];
      expect(dockerOptions?.HostConfig?.Memory).toBe(536870912);
    });

    it("should store container record in database", async () => {
      // Arrange
      const options = {
        image: "node:20-alpine",
        name: "test-container",
        workspaceId: testWorkspaceId,
      };

      // Act
      const container = await service.createContainer(options);

      // Assert
      expect(container.id).toBeDefined();
      expect(container.containerId).toBeDefined();
      expect(container.createdAt).toBeInstanceOf(Date);
    });

    it("should handle Docker creation errors", async () => {
      // Arrange
      const failingDockerClient: DockerClientInterface = {
        async createContainer() {
          throw new Error("Docker daemon not available");
        },
        async startContainer() {},
        async stopContainer() {},
        async removeContainer() {},
        async getContainer(): Promise<DockerContainerInfo> {
          throw new Error("Not implemented");
        },
        async listContainers(): Promise<DockerContainerInfo[]> {
          return [];
        },
        async exec(): Promise<DockerExecResult> {
          throw new Error("Not implemented");
        },
        async getLogs(): Promise<Readable> {
          throw new Error("Not implemented");
        },
      };

      const failingService = new ContainerManagerService(db, failingDockerClient);

      // Act & Assert
      await expect(
        failingService.createContainer({
          image: "node:20-alpine",
          name: "test-container",
        })
      ).rejects.toThrow();
    });

    it("should pass environment variables to container", async () => {
      // Arrange
      const options = {
        image: "node:20-alpine",
        name: "test-container",
        env: {
          NODE_ENV: "production",
          API_KEY: "secret",
        },
      };

      // Act
      await service.createContainer(options);

      // Assert
      const dockerOptions = Array.from(mockDockerClient.createdContainers.values())[0];
      expect(dockerOptions?.Env).toContain("NODE_ENV=production");
      expect(dockerOptions?.Env).toContain("API_KEY=secret");
    });
  });

  describe("startContainer", () => {
    it("should start a Docker container", async () => {
      // Arrange
      const container = await service.createContainer({
        image: "node:20-alpine",
        name: "test-container",
      });

      // Act
      await service.startContainer(container.id);

      // Assert
      expect(mockDockerClient.startedContainers.has(container.containerId)).toBe(true);
    });

    it("should update container status to running", async () => {
      // Arrange
      const container = await service.createContainer({
        image: "node:20-alpine",
        name: "test-container",
      });

      // Act
      const updatedContainer = await service.startContainer(container.id);

      // Assert
      expect(updatedContainer.status).toBe("running");
      expect(updatedContainer.startedAt).toBeInstanceOf(Date);
    });

    it("should handle start errors", async () => {
      // Arrange
      const failingDockerClient = new MockDockerClient();
      failingDockerClient.startContainer = async () => {
        throw new Error("Failed to start container");
      };
      const failingService = new ContainerManagerService(db, failingDockerClient);

      const container = await failingService.createContainer({
        image: "node:20-alpine",
        name: "test-container",
      });

      // Act & Assert
      await expect(failingService.startContainer(container.id)).rejects.toThrow();
    });

    it("should throw error for non-existent container", async () => {
      // Act & Assert
      await expect(service.startContainer("non-existent-id")).rejects.toThrow();
    });
  });

  describe("stopContainer", () => {
    it("should stop a running Docker container", async () => {
      // Arrange
      const container = await service.createContainer({
        image: "node:20-alpine",
        name: "test-container",
      });
      await service.startContainer(container.id);

      // Act
      await service.stopContainer(container.id);

      // Assert
      expect(mockDockerClient.stoppedContainers.has(container.containerId)).toBe(true);
    });

    it("should update container status to stopped", async () => {
      // Arrange
      const container = await service.createContainer({
        image: "node:20-alpine",
        name: "test-container",
      });
      await service.startContainer(container.id);

      // Act
      const updatedContainer = await service.stopContainer(container.id);

      // Assert
      expect(updatedContainer.status).toBe("stopped");
      expect(updatedContainer.stoppedAt).toBeInstanceOf(Date);
    });

    it("should handle graceful shutdown with SIGTERM then SIGKILL", async () => {
      // Arrange
      const stopSpy = vi.fn();
      mockDockerClient.stopContainer = async (containerId: string, timeout?: number) => {
        stopSpy(containerId, timeout);
        // Simulate stopping
        const info = mockDockerClient.containerInfoMap.get(containerId);
        if (info) {
          info.State.Running = false;
          info.State.Status = "exited";
        }
      };

      const container = await service.createContainer({
        image: "node:20-alpine",
        name: "test-container",
      });
      await service.startContainer(container.id);

      // Act
      await service.stopContainer(container.id, 10);

      // Assert
      expect(stopSpy).toHaveBeenCalledWith(container.containerId, 10);
    });

    it("should throw error for non-existent container", async () => {
      // Act & Assert
      await expect(service.stopContainer("non-existent-id")).rejects.toThrow();
    });
  });

  describe("removeContainer", () => {
    it("should remove container from Docker", async () => {
      // Arrange
      const container = await service.createContainer({
        image: "node:20-alpine",
        name: "test-container",
      });

      // Act
      await service.removeContainer(container.id);

      // Assert
      expect(mockDockerClient.removedContainers.has(container.containerId)).toBe(true);
    });

    it("should remove container from database", async () => {
      // Arrange
      const container = await service.createContainer({
        image: "node:20-alpine",
        name: "test-container",
      });

      // Act
      await service.removeContainer(container.id);

      // Assert
      const found = await service.getContainerStatus(container.id);
      expect(found).toBeNull();
    });

    it("should force remove if container is running", async () => {
      // Arrange
      const removeSpy = vi.fn();
      mockDockerClient.removeContainer = async (containerId: string, force?: boolean) => {
        removeSpy(containerId, force);
        mockDockerClient.containerInfoMap.delete(containerId);
      };

      const container = await service.createContainer({
        image: "node:20-alpine",
        name: "test-container",
      });
      await service.startContainer(container.id);

      // Act
      await service.removeContainer(container.id, true);

      // Assert
      expect(removeSpy).toHaveBeenCalledWith(container.containerId, true);
    });

    it("should throw error for non-existent container", async () => {
      // Act & Assert
      await expect(service.removeContainer("non-existent-id")).rejects.toThrow();
    });
  });

  describe("getContainerStatus", () => {
    it("should get current container state", async () => {
      // Arrange
      const container = await service.createContainer({
        image: "node:20-alpine",
        name: "test-container",
      });

      // Act
      const status = await service.getContainerStatus(container.id);

      // Assert
      expect(status).toBeDefined();
      expect(status?.id).toBe(container.id);
      expect(status?.status).toBe("creating");
    });

    it("should return null for non-existent container", async () => {
      // Act
      const status = await service.getContainerStatus("non-existent-id");

      // Assert
      expect(status).toBeNull();
    });

    it("should reflect updated status after starting", async () => {
      // Arrange
      const container = await service.createContainer({
        image: "node:20-alpine",
        name: "test-container",
      });
      await service.startContainer(container.id);

      // Act
      const status = await service.getContainerStatus(container.id);

      // Assert
      expect(status?.status).toBe("running");
      expect(status?.startedAt).toBeInstanceOf(Date);
    });
  });

  describe("exec", () => {
    it("should run command in container", async () => {
      // Arrange
      const container = await service.createContainer({
        image: "node:20-alpine",
        name: "test-container",
      });
      await service.startContainer(container.id);

      // Act
      const result = await service.exec(container.id, ["echo", "hello"]);

      // Assert
      expect(result).toBeDefined();
      expect(result.exitCode).toBe(0);
    });

    it("should return command output", async () => {
      // Arrange
      const container = await service.createContainer({
        image: "node:20-alpine",
        name: "test-container",
      });
      await service.startContainer(container.id);

      // Act
      const result = await service.exec(container.id, ["echo", "hello"]);

      // Assert
      expect(result.stdout).toBeDefined();
      expect(typeof result.stdout).toBe("string");
    });

    it("should handle execution errors", async () => {
      // Arrange
      mockDockerClient.exec = async () => {
        throw new Error("Command execution failed");
      };

      const container = await service.createContainer({
        image: "node:20-alpine",
        name: "test-container",
      });
      await service.startContainer(container.id);

      // Act & Assert
      await expect(service.exec(container.id, ["invalid-command"])).rejects.toThrow();
    });

    it("should throw error for non-existent container", async () => {
      // Act & Assert
      await expect(service.exec("non-existent-id", ["echo", "hello"])).rejects.toThrow();
    });
  });

  describe("getLogs", () => {
    it("should return log stream for container", async () => {
      // Arrange
      const container = await service.createContainer({
        image: "node:20-alpine",
        name: "test-container",
      });
      await service.startContainer(container.id);

      // Act
      const logStream = await service.getLogs(container.id);

      // Assert
      expect(logStream).toBeInstanceOf(Readable);
    });

    it("should handle log retrieval errors", async () => {
      // Arrange
      mockDockerClient.getLogs = async () => {
        throw new Error("Failed to get logs");
      };

      const container = await service.createContainer({
        image: "node:20-alpine",
        name: "test-container",
      });

      // Act & Assert
      await expect(service.getLogs(container.id)).rejects.toThrow();
    });

    it("should pass log options to Docker client", async () => {
      // Arrange
      const getLogsSpy = vi.fn(async () => {
        return new Readable({ read() { this.push(null); } });
      });
      mockDockerClient.getLogs = getLogsSpy;

      const container = await service.createContainer({
        image: "node:20-alpine",
        name: "test-container",
      });
      await service.startContainer(container.id);

      // Act
      await service.getLogs(container.id, {
        follow: true,
        tail: 100,
        timestamps: true,
      });

      // Assert
      expect(getLogsSpy).toHaveBeenCalledWith(
        container.containerId,
        expect.objectContaining({
          follow: true,
          tail: 100,
          timestamps: true,
        })
      );
    });

    it("should throw error for non-existent container", async () => {
      // Act & Assert
      await expect(service.getLogs("non-existent-id")).rejects.toThrow();
    });
  });
});
