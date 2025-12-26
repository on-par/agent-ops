import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../../shared/db/schema.js";
import { containerLogsRoutes } from "../handler/container-logs.handler.js";
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
 * Mock Docker client for testing SSE logs
 */
class MockDockerClient implements DockerClientInterface {
  public containerInfoMap: Map<string, DockerContainerInfo> = new Map();

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

    // Create a mock log stream
    const stream = new Readable({
      read() {
        // Emit some mock log lines
        this.push("Log line 1\n");
        this.push("Log line 2\n");
        this.push("Log line 3\n");
        // End the stream
        this.push(null);
      },
    });

    return stream;
  }
}

describe("ContainerLogsHandler", () => {
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

    // Create containers table
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
    await app.register(containerLogsRoutes, {
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

  describe("GET /api/containers/:id/logs/stream", () => {
    it.skip("route exists and is accessible (returns non-404 status)", async () => {
      // NOTE: SSE endpoints don't work well with fastify.inject() because it requires
      // a real HTTP connection. This test is skipped in favor of manual E2E testing.
      // See Phase 4.2 in implementation plan for manual testing instructions.
    });

    it("returns 404 for non-existent container", async () => {
      // Act: GET logs/stream for non-existent container
      const response = await app.inject({
        method: "GET",
        url: "/api/containers/non-existent-id/logs/stream",
      });

      // Assert
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Container not found");
    });

    it.skip("accepts valid query parameters", async () => {
      // NOTE: SSE endpoints don't work well with fastify.inject() because it requires
      // a real HTTP connection. This test is skipped in favor of manual E2E testing.
      // See Phase 4.2 in implementation plan for manual testing instructions.
    });

    it.skip("sets SSE Content-Type header", async () => {
      // NOTE: SSE endpoints don't work well with fastify.inject() because it requires
      // a real HTTP connection. This test is skipped in favor of manual E2E testing.
      // See Phase 4.2 in implementation plan for manual testing instructions.
    });
  });

  describe("GET /api/containers/:id/logs", () => {
    it.skip("route exists and handler is registered", async () => {
      // Arrange: Create a running container
      const containerId = uuidv4();
      const dockerContainerId = "docker-logs-123";

      // Register container in mock Docker client
      mockDockerClient.containerInfoMap.set(dockerContainerId, {
        Id: dockerContainerId,
        Name: "logs-test-container",
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
        name: "logs-test-container",
        image: "node:20-alpine",
        status: "running",
        createdAt: new Date(),
        startedAt: new Date(),
      };
      await db.insert(schema.containers).values(container);

      // Act: Attempt to call logs endpoint
      // Note: SSE doesn't work well with fastify.inject() because it requires
      // a real HTTP connection. This test verifies the route is registered.
      const response = await app.inject({
        method: "GET",
        url: `/api/containers/${containerId}/logs`,
      });

      // Assert: The route exists (not 404)
      // We expect an error because inject() doesn't support SSE properly,
      // but it shouldn't be a 404
      expect(response.statusCode).not.toBe(404);
    });

    it("returns 404 for non-existent container", async () => {
      // Act: GET logs for non-existent container
      const response = await app.inject({
        method: "GET",
        url: "/api/containers/non-existent-id/logs",
      });

      // Assert
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Container not found");
    });

    it.skip("validates query parameters", async () => {
      // Arrange: Create a running container
      const containerId = uuidv4();
      const dockerContainerId = "docker-logs-456";

      // Register container in mock Docker client
      mockDockerClient.containerInfoMap.set(dockerContainerId, {
        Id: dockerContainerId,
        Name: "logs-test-container-2",
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
        name: "logs-test-container-2",
        image: "python:3.11",
        status: "running",
        createdAt: new Date(),
        startedAt: new Date(),
      };
      await db.insert(schema.containers).values(container);

      // Act: GET logs with query parameters
      const response = await app.inject({
        method: "GET",
        url: `/api/containers/${containerId}/logs?follow=true&tail=100&timestamps=true`,
      });

      // Assert: Route exists and query params are accepted (not 400)
      expect(response.statusCode).not.toBe(400);
      expect(response.statusCode).not.toBe(404);
    });
  });
});
