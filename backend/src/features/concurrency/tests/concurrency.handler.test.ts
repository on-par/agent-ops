import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { concurrencyHandler } from "../handler/concurrency.handler.js";
import { ConcurrencyLimitsService } from "../../../services/orchestration.service.js";

describe("Concurrency Handler", () => {
  let app: FastifyInstance;
  let concurrencyService: ConcurrencyLimitsService;

  beforeEach(async () => {
    // Create concurrency service with test limits
    concurrencyService = new ConcurrencyLimitsService({
      maxGlobalWorkers: 10,
      maxWorkersPerRepo: 3,
      maxWorkersPerUser: 5,
    });

    // Create Fastify app with handler
    app = Fastify({ logger: false });
    await app.register(concurrencyHandler, { concurrencyService });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // Tests for GET /status
  describe("GET /status", () => {
    it("should return current concurrency status with empty state", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/status",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.global).toEqual({ current: 0, max: 10 });
      expect(body.byRepo).toEqual({});
      expect(body.byUser).toEqual({});
    });

    it("should reflect registered executions in status", async () => {
      // Register some executions
      concurrencyService.registerStart(
        { createdBy: "user-1", repositoryId: "repo-1" } as any,
        "worker-1"
      );
      concurrencyService.registerStart(
        { createdBy: "user-1", repositoryId: "repo-2" } as any,
        "worker-2"
      );
      concurrencyService.registerStart(
        { createdBy: "user-2", repositoryId: "repo-1" } as any,
        "worker-3"
      );

      const response = await app.inject({
        method: "GET",
        url: "/status",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.global.current).toBe(3);
      expect(body.byRepo["repo-1"].current).toBe(2);
      expect(body.byRepo["repo-2"].current).toBe(1);
      expect(body.byUser["user-1"].current).toBe(2);
      expect(body.byUser["user-2"].current).toBe(1);
    });
  });

  // Tests for GET /limits
  describe("GET /limits", () => {
    it("should return current limit configuration", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/limits",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.maxGlobalWorkers).toBe(10);
    });
  });

  // Tests for PUT /limits
  describe("PUT /limits", () => {
    it("should update global worker limit", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/limits",
        payload: {
          maxGlobalWorkers: 20,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.maxGlobalWorkers).toBe(20);

      // Verify the change persisted
      const statusResponse = await app.inject({
        method: "GET",
        url: "/status",
      });
      const status = JSON.parse(statusResponse.body);
      expect(status.global.max).toBe(20);
    });

    it("should update per-repo limit", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/limits",
        payload: {
          maxWorkersPerRepo: 5,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("should update per-user limit", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/limits",
        payload: {
          maxWorkersPerUser: 8,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it("should update multiple limits at once", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/limits",
        payload: {
          maxGlobalWorkers: 25,
          maxWorkersPerRepo: 4,
          maxWorkersPerUser: 6,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.maxGlobalWorkers).toBe(25);
    });

    it("should return 400 when no limits provided", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/limits",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("At least one limit must be provided");
    });

    it("should return 400 for invalid limit values", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/limits",
        payload: {
          maxGlobalWorkers: 0, // Must be >= 1
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Validation failed");
    });

    it("should return 400 for negative limit values", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/limits",
        payload: {
          maxWorkersPerRepo: -5,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return 400 for limit values exceeding max", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/limits",
        payload: {
          maxGlobalWorkers: 2000, // Max is 1000
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // Tests for GET /can-start
  describe("GET /can-start", () => {
    it("should allow execution when within limits", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/can-start?userId=user-1&repositoryId=repo-1",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.allowed).toBe(true);
    });

    it("should allow execution without repositoryId", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/can-start?userId=user-1",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.allowed).toBe(true);
    });

    it("should block when global limit reached", async () => {
      // Fill up the global limit (10)
      for (let i = 0; i < 10; i++) {
        concurrencyService.registerStart(
          { createdBy: `user-${i}`, repositoryId: `repo-${i}` } as any,
          `worker-${i}`
        );
      }

      const response = await app.inject({
        method: "GET",
        url: "/can-start?userId=user-new",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.allowed).toBe(false);
      expect(body.reason).toContain("Global concurrent limit");
    });

    it("should block when per-repo limit reached", async () => {
      // Fill up per-repo limit (3)
      for (let i = 0; i < 3; i++) {
        concurrencyService.registerStart(
          { createdBy: `user-${i}`, repositoryId: "repo-1" } as any,
          `worker-${i}`
        );
      }

      const response = await app.inject({
        method: "GET",
        url: "/can-start?userId=user-new&repositoryId=repo-1",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.allowed).toBe(false);
      expect(body.reason).toContain("Per-repository limit");
    });

    it("should block when per-user limit reached", async () => {
      // Fill up per-user limit (5)
      for (let i = 0; i < 5; i++) {
        concurrencyService.registerStart(
          { createdBy: "user-1", repositoryId: `repo-${i}` } as any,
          `worker-${i}`
        );
      }

      const response = await app.inject({
        method: "GET",
        url: "/can-start?userId=user-1&repositoryId=repo-new",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.allowed).toBe(false);
      expect(body.reason).toContain("Per-user limit");
    });

    it("should return 400 when userId is missing", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/can-start?repositoryId=repo-1",
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("userId query parameter is required");
    });
  });

  // Integration tests
  describe("Integration", () => {
    it("should allow execution after updating limits", async () => {
      // Fill up the default global limit (10)
      for (let i = 0; i < 10; i++) {
        concurrencyService.registerStart(
          { createdBy: `user-${i}`, repositoryId: `repo-${i}` } as any,
          `worker-${i}`
        );
      }

      // Verify we're blocked
      let response = await app.inject({
        method: "GET",
        url: "/can-start?userId=user-new",
      });
      expect(JSON.parse(response.body).allowed).toBe(false);

      // Increase the limit
      await app.inject({
        method: "PUT",
        url: "/limits",
        payload: { maxGlobalWorkers: 15 },
      });

      // Now we should be allowed
      response = await app.inject({
        method: "GET",
        url: "/can-start?userId=user-new",
      });
      expect(JSON.parse(response.body).allowed).toBe(true);
    });

    it("should reflect completions in status and allow new executions", async () => {
      // Fill up per-repo limit
      for (let i = 0; i < 3; i++) {
        concurrencyService.registerStart(
          { createdBy: `user-${i}`, repositoryId: "repo-1" } as any,
          `worker-${i}`
        );
      }

      // Verify blocked
      let response = await app.inject({
        method: "GET",
        url: "/can-start?userId=user-new&repositoryId=repo-1",
      });
      expect(JSON.parse(response.body).allowed).toBe(false);

      // Complete one execution
      concurrencyService.registerCompletion(
        { createdBy: "user-0", repositoryId: "repo-1" } as any,
        "worker-0"
      );

      // Now should be allowed
      response = await app.inject({
        method: "GET",
        url: "/can-start?userId=user-new&repositoryId=repo-1",
      });
      expect(JSON.parse(response.body).allowed).toBe(true);

      // Verify status reflects the change
      response = await app.inject({
        method: "GET",
        url: "/status",
      });
      const status = JSON.parse(response.body);
      expect(status.byRepo["repo-1"].current).toBe(2);
    });
  });
});
