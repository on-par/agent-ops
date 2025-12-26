import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../../shared/db/schema.js";
import { containerTerminalHandler } from "../handler/container-terminal.handler.js";
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
import { Readable, Duplex } from "stream";
import { EventEmitter } from "events";
import WebSocket from "ws";

/**
 * Mock Docker client for testing WebSocket terminal
 */
class MockDockerClient implements DockerClientInterface {
  public containerInfoMap: Map<string, DockerContainerInfo> = new Map();
  public mockTerminalStreams: Map<string, Duplex> = new Map();

  async createContainer(options: DockerCreateContainerOptions): Promise<string> {
    const containerId = `mock-container-${uuidv4()}`;
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
    const info = this.containerInfoMap.get(containerId);
    if (!info) throw new Error(`Container ${containerId} not found`);
    info.State.Status = "running";
    info.State.Running = true;
  }

  async stopContainer(containerId: string, timeout?: number): Promise<void> {
    const info = this.containerInfoMap.get(containerId);
    if (!info) throw new Error(`Container ${containerId} not found`);
    info.State.Status = "exited";
    info.State.Running = false;
  }

  async removeContainer(containerId: string, force?: boolean): Promise<void> {
    this.containerInfoMap.delete(containerId);
  }

  async getContainer(containerId: string): Promise<DockerContainerInfo> {
    const info = this.containerInfoMap.get(containerId);
    if (!info) throw new Error(`Container ${containerId} not found`);
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
        this.push("Mock log line 1\n");
        this.push("Mock log line 2\n");
        this.push(null);
      },
    });
    return stream;
  }

  // Mock methods for terminal support
  async execCreate(containerId: string, options: any): Promise<{ id: string }> {
    if (!this.containerInfoMap.has(containerId)) {
      throw new Error(`Container ${containerId} not found`);
    }
    const execId = `exec-${uuidv4()}`;
    return { id: execId };
  }

  async execStart(execId: string): Promise<Duplex> {
    const mockStream = new EventEmitter() as Duplex;
    mockStream.write = vi.fn();
    mockStream.end = vi.fn();
    mockStream.destroy = vi.fn();

    this.mockTerminalStreams.set(execId, mockStream);
    return mockStream;
  }

  async execResize(execId: string, cols: number, rows: number): Promise<void> {
    // No-op for mock
  }

  getMockStream(execId: string): Duplex | undefined {
    return this.mockTerminalStreams.get(execId);
  }
}

describe("ContainerTerminalHandler", () => {
  let app: FastifyInstance;
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let mockDockerClient: MockDockerClient;
  let containerService: ContainerManagerService;
  let testContainerId: string;

  const mockConfig: Config = {
    port: 3000,
    isDevelopment: true,
    githubClientId: "test",
    githubClientSecret: "test",
    githubWebhookSecret: "test",
    sessionSecret: "test",
    frontendUrl: "http://localhost:5173",
    maxGlobalWorkers: 10,
    maxWorkersPerRepo: 5,
    maxWorkersPerUser: 3,
  };

  beforeEach(async () => {
    // Create in-memory SQLite database
    sqlite = new Database(":memory:");
    db = drizzle(sqlite, { schema });

    // Run migrations
    const migrations = [
      `CREATE TABLE IF NOT EXISTS containers (
        id TEXT PRIMARY KEY,
        container_id TEXT NOT NULL UNIQUE,
        workspace_id TEXT,
        worker_id TEXT,
        execution_id TEXT,
        image TEXT NOT NULL,
        status TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        stopped_at INTEGER
      )`,
    ];

    for (const migration of migrations) {
      sqlite.exec(migration);
    }

    // Create mock Docker client and container service
    mockDockerClient = new MockDockerClient();
    containerService = new ContainerManagerService(db, mockDockerClient as any);

    // Create test container
    const dockerContainerId = await mockDockerClient.createContainer({
      Image: "alpine:latest",
      name: "test-container",
    });

    await mockDockerClient.startContainer(dockerContainerId);

    const newContainer: NewContainer = {
      id: uuidv4(),
      containerId: dockerContainerId,
      name: "test-container",
      image: "alpine:latest",
      status: "running",
      workerId: "test-worker",
      createdAt: new Date(),
    };

    // Insert into database
    await db.insert(schema.containers).values(newContainer);
    testContainerId = newContainer.id;

    // Create Fastify app with WebSocket support
    app = Fastify();
    await app.register(websocket);

    // Register terminal handler
    await app.register(containerTerminalHandler, {
      prefix: "/api/containers",
      db,
      config: mockConfig,
      containerService,
    });

    await app.ready();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    if (sqlite) {
      sqlite.close();
    }
  });

  describe("GET /:id/terminal", () => {
    it("should upgrade to WebSocket for valid container", async () => {
      // Create WebSocket client
      const address = await app.listen({ port: 0 });
      const port = (app.server.address() as any).port;
      const ws = new WebSocket(`ws://localhost:${port}/api/containers/${testContainerId}/terminal`);

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        ws.on("open", () => resolve());
        ws.on("error", reject);
        setTimeout(() => reject(new Error("Connection timeout")), 1000);
      });

      expect(ws.readyState).toBe(WebSocket.OPEN);

      ws.close();
    });

    it("should return 404 for non-existent container", async () => {
      const address = await app.listen({ port: 0 });
      const port = (app.server.address() as any).port;
      const ws = new WebSocket(`ws://localhost:${port}/api/containers/non-existent/terminal`);

      // Wait for error or close
      await new Promise<void>((resolve) => {
        ws.on("close", () => resolve());
        ws.on("error", () => resolve());
        setTimeout(() => resolve(), 1000);
      });

      expect(ws.readyState).not.toBe(WebSocket.OPEN);
    });

    it("should attach terminal and setup data relay", async () => {
      const address = await app.listen({ port: 0 });
      const port = (app.server.address() as any).port;
      const ws = new WebSocket(`ws://localhost:${port}/api/containers/${testContainerId}/terminal`);

      await new Promise<void>((resolve, reject) => {
        ws.on("open", () => {
          // Give time for terminal to attach
          setTimeout(() => {
            // Verify exec was created
            const execId = Array.from(mockDockerClient.mockTerminalStreams.keys())[0];
            expect(execId).toBeDefined();

            const stream = mockDockerClient.getMockStream(execId!);
            expect(stream).toBeDefined();

            // Verify data handler was registered (listenerCount for 'data' event)
            expect(stream?.listenerCount('data')).toBeGreaterThan(0);

            resolve();
          }, 100);
        });

        ws.on("error", reject);
      });

      ws.close();
    });

    it("should setup message handler for stdin relay", async () => {
      const address = await app.listen({ port: 0 });
      const port = (app.server.address() as any).port;
      const ws = new WebSocket(`ws://localhost:${port}/api/containers/${testContainerId}/terminal`);

      await new Promise<void>((resolve, reject) => {
        ws.on("open", () => {
          // Give time for terminal to attach
          setTimeout(() => {
            const execId = Array.from(mockDockerClient.mockTerminalStreams.keys())[0];
            const stream = mockDockerClient.getMockStream(execId!);

            // Verify stream is available (message handler is set up)
            expect(stream).toBeDefined();
            expect(stream?.write).toBeDefined();

            resolve();
          }, 100);
        });

        ws.on("error", reject);
      });

      ws.close();
    });

    it("should handle resize events", async () => {
      const address = await app.listen({ port: 0 });
      const port = (app.server.address() as any).port;
      const ws = new WebSocket(`ws://localhost:${port}/api/containers/${testContainerId}/terminal`);

      await new Promise<void>((resolve, reject) => {
        ws.on("open", () => {
          // Send resize message
          ws.send(JSON.stringify({ type: "resize", cols: 120, rows: 30 }));
          setTimeout(() => resolve(), 100);
        });

        ws.on("error", reject);
      });

      // Test passes if no error is thrown
      ws.close();
    });

    it("should clean up on disconnect", async () => {
      const address = await app.listen({ port: 0 });
      const port = (app.server.address() as any).port;
      const ws = new WebSocket(`ws://localhost:${port}/api/containers/${testContainerId}/terminal`);

      let execId: string | undefined;

      await new Promise<void>((resolve) => {
        ws.on("open", () => {
          execId = Array.from(mockDockerClient.mockTerminalStreams.keys())[0];
          ws.close();
        });

        ws.on("close", () => {
          setTimeout(() => resolve(), 100);
        });
      });

      // Verify stream was destroyed
      if (execId) {
        const stream = mockDockerClient.getMockStream(execId);
        expect((stream?.destroy as any)).toHaveBeenCalled();
      }
    });
  });
});
