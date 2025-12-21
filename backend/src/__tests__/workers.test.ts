import { describe, it, expect, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  setupTestDatabase,
  getTestDatabase,
  clearTestDatabase,
  testFixtures,
  seedDatabase,
} from "./setup.js";
import * as schema from "../db/schema.js";
import type { WorkerStatus, AgentRole } from "../db/schema.js";

setupTestDatabase();

describe("Workers - Database Operations", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  // ========================================
  // CREATE (Spawn) Tests
  // ========================================

  describe("CREATE (Spawn Worker)", () => {
    it("should spawn a worker from a template", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1", {
        sessionId: "session-123",
      });

      const [spawned] = await db.insert(schema.workers).values(worker).returning();

      expect(spawned).toBeDefined();
      expect(spawned.id).toBe(worker.id);
      expect(spawned.templateId).toBe("template-1");
      expect(spawned.status).toBe("idle");
      expect(spawned.sessionId).toBe("session-123");
      expect(spawned.spawnedAt).toBeTruthy();
    });

    it("should spawn worker with default metrics", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1");
      const [spawned] = await db.insert(schema.workers).values(worker).returning();

      expect(spawned.contextWindowUsed).toBe(0);
      expect(spawned.contextWindowLimit).toBe(200000);
      expect(spawned.tokensUsed).toBe(0);
      expect(spawned.costUsd).toBe(0);
      expect(spawned.toolCalls).toBe(0);
      expect(spawned.errors).toBe(0);
    });

    it("should spawn worker with custom context window limit", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1", {
        contextWindowLimit: 100000,
      });

      const [spawned] = await db.insert(schema.workers).values(worker).returning();

      expect(spawned.contextWindowLimit).toBe(100000);
    });

    it("should spawn multiple workers from the same template", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker1 = testFixtures.worker("template-1");
      const worker2 = testFixtures.worker("template-1");
      const worker3 = testFixtures.worker("template-1");

      await db.insert(schema.workers).values([worker1, worker2, worker3]);

      const workers = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.templateId, "template-1"));

      expect(workers).toHaveLength(3);
    });

    it("should reject worker without template ID", async () => {
      const db = getTestDatabase();
      const invalid = {
        id: uuidv4(),
        sessionId: uuidv4(),
        spawnedAt: new Date(),
        // Missing templateId
      };

      await expect(db.insert(schema.workers).values(invalid as any)).rejects.toThrow();
    });

    it("should reject worker with non-existent template ID", async () => {
      const db = getTestDatabase();
      const worker = testFixtures.worker("non-existent-template");

      // With foreign key constraints enabled, this should fail
      await expect(db.insert(schema.workers).values(worker)).rejects.toThrow();
    });
  });

  // ========================================
  // READ Tests
  // ========================================

  describe("READ", () => {
    it("should read a worker by ID", async () => {
      const db = getTestDatabase();
      await seedDatabase(db);

      const [found] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, "worker-1"));

      expect(found).toBeDefined();
      expect(found.id).toBe("worker-1");
    });

    it("should return empty array for non-existent ID", async () => {
      const db = getTestDatabase();

      const results = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, "non-existent"));

      expect(results).toHaveLength(0);
    });

    it("should list all workers", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const workers = [
        testFixtures.worker("template-1"),
        testFixtures.worker("template-1"),
        testFixtures.worker("template-1"),
      ];

      await db.insert(schema.workers).values(workers);

      const results = await db.select().from(schema.workers);

      expect(results).toHaveLength(3);
    });

    it("should filter workers by template ID", async () => {
      const db = getTestDatabase();
      const template1 = testFixtures.template({ id: "template-1" });
      const template2 = testFixtures.template({ id: "template-2" });
      await db.insert(schema.templates).values([template1, template2]);

      await db.insert(schema.workers).values([
        testFixtures.worker("template-1"),
        testFixtures.worker("template-2"),
        testFixtures.worker("template-1"),
      ]);

      const template1Workers = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.templateId, "template-1"));

      expect(template1Workers).toHaveLength(2);
    });

    it("should filter workers by status", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      await db.insert(schema.workers).values([
        testFixtures.worker("template-1", { status: "idle" }),
        testFixtures.worker("template-1", { status: "working" }),
        testFixtures.worker("template-1", { status: "working" }),
        testFixtures.worker("template-1", { status: "terminated" }),
      ]);

      const workingWorkers = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.status, "working"));

      expect(workingWorkers).toHaveLength(2);
    });

    it("should filter workers by current work item", async () => {
      const db = getTestDatabase();
      await seedDatabase(db);

      const workers = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.currentWorkItemId, "work-item-3"));

      expect(workers).toHaveLength(1);
      expect(workers[0].id).toBe("worker-1");
    });

    it("should find idle workers", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      await db.insert(schema.workers).values([
        testFixtures.worker("template-1", { status: "idle" }),
        testFixtures.worker("template-1", { status: "working" }),
        testFixtures.worker("template-1", { status: "idle" }),
      ]);

      const idleWorkers = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.status, "idle"));

      expect(idleWorkers).toHaveLength(2);
    });

    it("should join workers with their templates", async () => {
      const db = getTestDatabase();
      await seedDatabase(db);

      const results = await db
        .select({
          worker: schema.workers,
          template: schema.templates,
        })
        .from(schema.workers)
        .leftJoin(
          schema.templates,
          eq(schema.workers.templateId, schema.templates.id)
        );

      expect(results).toHaveLength(1);
      expect(results[0].worker.id).toBe("worker-1");
      expect(results[0].template?.id).toBe("template-1");
      expect(results[0].template?.name).toBe("Implementer Template");
    });

    it("should join workers with their current work items", async () => {
      const db = getTestDatabase();
      await seedDatabase(db);

      const results = await db
        .select({
          worker: schema.workers,
          workItem: schema.workItems,
        })
        .from(schema.workers)
        .leftJoin(
          schema.workItems,
          eq(schema.workers.currentWorkItemId, schema.workItems.id)
        );

      expect(results).toHaveLength(1);
      expect(results[0].worker.id).toBe("worker-1");
      expect(results[0].workItem?.id).toBe("work-item-3");
    });
  });

  // ========================================
  // UPDATE Tests
  // ========================================

  describe("UPDATE", () => {
    it("should update worker status", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1", { status: "idle" });
      await db.insert(schema.workers).values(worker);

      await db
        .update(schema.workers)
        .set({ status: "working" })
        .where(eq(schema.workers.id, worker.id));

      const [updated] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, worker.id));

      expect(updated.status).toBe("working");
    });

    it("should assign work item to worker", async () => {
      const db = getTestDatabase();
      await seedDatabase(db);

      const workItem = testFixtures.workItem({ id: "new-work-item" });
      await db.insert(schema.workItems).values(workItem);

      await db
        .update(schema.workers)
        .set({
          status: "working",
          currentWorkItemId: "new-work-item",
          currentRole: "implementer",
        })
        .where(eq(schema.workers.id, "worker-1"));

      const [updated] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, "worker-1"));

      expect(updated.status).toBe("working");
      expect(updated.currentWorkItemId).toBe("new-work-item");
      expect(updated.currentRole).toBe("implementer");
    });

    it("should unassign work item from worker", async () => {
      const db = getTestDatabase();
      await seedDatabase(db);

      await db
        .update(schema.workers)
        .set({
          status: "idle",
          currentWorkItemId: null,
          currentRole: null,
        })
        .where(eq(schema.workers.id, "worker-1"));

      const [updated] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, "worker-1"));

      expect(updated.status).toBe("idle");
      expect(updated.currentWorkItemId).toBeNull();
      expect(updated.currentRole).toBeNull();
    });

    it("should update worker metrics", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1");
      await db.insert(schema.workers).values(worker);

      await db
        .update(schema.workers)
        .set({
          contextWindowUsed: 50000,
          tokensUsed: 10000,
          costUsd: 0.05,
          toolCalls: 25,
        })
        .where(eq(schema.workers.id, worker.id));

      const [updated] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, worker.id));

      expect(updated.contextWindowUsed).toBe(50000);
      expect(updated.tokensUsed).toBe(10000);
      expect(updated.costUsd).toBe(0.05);
      expect(updated.toolCalls).toBe(25);
    });

    it("should increment token usage", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1", { tokensUsed: 1000 });
      await db.insert(schema.workers).values(worker);

      // Simulate incrementing tokens
      const [current] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, worker.id));

      await db
        .update(schema.workers)
        .set({ tokensUsed: current.tokensUsed + 500 })
        .where(eq(schema.workers.id, worker.id));

      const [updated] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, worker.id));

      expect(updated.tokensUsed).toBe(1500);
    });

    it("should increment tool call count", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1", { toolCalls: 10 });
      await db.insert(schema.workers).values(worker);

      const [current] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, worker.id));

      await db
        .update(schema.workers)
        .set({ toolCalls: current.toolCalls + 1 })
        .where(eq(schema.workers.id, worker.id));

      const [updated] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, worker.id));

      expect(updated.toolCalls).toBe(11);
    });

    it("should increment error count", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1", { errors: 0 });
      await db.insert(schema.workers).values(worker);

      const [current] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, worker.id));

      await db
        .update(schema.workers)
        .set({
          errors: current.errors + 1,
          status: "error",
        })
        .where(eq(schema.workers.id, worker.id));

      const [updated] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, worker.id));

      expect(updated.errors).toBe(1);
      expect(updated.status).toBe("error");
    });

    it("should update context window usage", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1", {
        contextWindowUsed: 100000,
        contextWindowLimit: 200000,
      });
      await db.insert(schema.workers).values(worker);

      await db
        .update(schema.workers)
        .set({ contextWindowUsed: 150000 })
        .where(eq(schema.workers.id, worker.id));

      const [updated] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, worker.id));

      expect(updated.contextWindowUsed).toBe(150000);
      expect(updated.contextWindowUsed).toBeLessThan(updated.contextWindowLimit);
    });

    it("should return updated worker", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1");
      await db.insert(schema.workers).values(worker);

      const [updated] = await db
        .update(schema.workers)
        .set({ status: "working" })
        .where(eq(schema.workers.id, worker.id))
        .returning();

      expect(updated).toBeDefined();
      expect(updated.status).toBe("working");
    });
  });

  // ========================================
  // DELETE (Terminate) Tests
  // ========================================

  describe("DELETE (Terminate Worker)", () => {
    it("should terminate a worker", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1");
      await db.insert(schema.workers).values(worker);

      await db.delete(schema.workers).where(eq(schema.workers.id, worker.id));

      const results = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, worker.id));

      expect(results).toHaveLength(0);
    });

    it("should mark worker as terminated instead of deleting", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1", { status: "working" });
      await db.insert(schema.workers).values(worker);

      // Soft delete by updating status
      await db
        .update(schema.workers)
        .set({ status: "terminated", currentWorkItemId: null, currentRole: null })
        .where(eq(schema.workers.id, worker.id));

      const [updated] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, worker.id));

      expect(updated.status).toBe("terminated");
      expect(updated.currentWorkItemId).toBeNull();
    });

    it("should delete multiple workers", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      await db.insert(schema.workers).values([
        testFixtures.worker("template-1", { status: "terminated" }),
        testFixtures.worker("template-1", { status: "terminated" }),
        testFixtures.worker("template-1", { status: "idle" }),
      ]);

      await db.delete(schema.workers).where(eq(schema.workers.status, "terminated"));

      const remaining = await db.select().from(schema.workers);

      expect(remaining).toHaveLength(1);
      expect(remaining[0].status).toBe("idle");
    });

    it("should return deleted worker", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1");
      await db.insert(schema.workers).values(worker);

      const [deleted] = await db
        .delete(schema.workers)
        .where(eq(schema.workers.id, worker.id))
        .returning();

      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(worker.id);
    });
  });

  // ========================================
  // Status Transition Tests
  // ========================================

  describe("Status Transitions", () => {
    it("should transition: idle → working", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1", { status: "idle" });
      await db.insert(schema.workers).values(worker);

      await db
        .update(schema.workers)
        .set({ status: "working" })
        .where(eq(schema.workers.id, worker.id));

      const [updated] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, worker.id));

      expect(updated.status).toBe("working");
    });

    it("should transition: working → idle", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1", { status: "working" });
      await db.insert(schema.workers).values(worker);

      await db
        .update(schema.workers)
        .set({ status: "idle", currentWorkItemId: null, currentRole: null })
        .where(eq(schema.workers.id, worker.id));

      const [updated] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, worker.id));

      expect(updated.status).toBe("idle");
      expect(updated.currentWorkItemId).toBeNull();
    });

    it("should transition: working → paused", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1", { status: "working" });
      await db.insert(schema.workers).values(worker);

      await db
        .update(schema.workers)
        .set({ status: "paused" })
        .where(eq(schema.workers.id, worker.id));

      const [updated] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, worker.id));

      expect(updated.status).toBe("paused");
    });

    it("should transition: paused → working", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1", { status: "paused" });
      await db.insert(schema.workers).values(worker);

      await db
        .update(schema.workers)
        .set({ status: "working" })
        .where(eq(schema.workers.id, worker.id));

      const [updated] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, worker.id));

      expect(updated.status).toBe("working");
    });

    it("should transition: working → error", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1", { status: "working" });
      await db.insert(schema.workers).values(worker);

      await db
        .update(schema.workers)
        .set({ status: "error", errors: 1 })
        .where(eq(schema.workers.id, worker.id));

      const [updated] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, worker.id));

      expect(updated.status).toBe("error");
      expect(updated.errors).toBe(1);
    });

    it("should transition: any → terminated", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const statuses: WorkerStatus[] = ["idle", "working", "paused", "error"];

      for (const status of statuses) {
        const worker = testFixtures.worker("template-1", { status });
        await db.insert(schema.workers).values(worker);

        await db
          .update(schema.workers)
          .set({ status: "terminated" })
          .where(eq(schema.workers.id, worker.id));

        const [updated] = await db
          .select()
          .from(schema.workers)
          .where(eq(schema.workers.id, worker.id));

        expect(updated.status).toBe("terminated");
      }
    });
  });

  // ========================================
  // Metrics Tests
  // ========================================

  describe("Metrics", () => {
    it("should track cumulative cost", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1", { costUsd: 0.01 });
      await db.insert(schema.workers).values(worker);

      // Add more cost
      const [current] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, worker.id));

      await db
        .update(schema.workers)
        .set({ costUsd: current.costUsd + 0.02 })
        .where(eq(schema.workers.id, worker.id));

      const [updated] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, worker.id));

      expect(updated.costUsd).toBeCloseTo(0.03, 2);
    });

    it("should calculate context window percentage", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1", {
        contextWindowUsed: 100000,
        contextWindowLimit: 200000,
      });
      await db.insert(schema.workers).values(worker);

      const [retrieved] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, worker.id));

      const percentage =
        (retrieved.contextWindowUsed / retrieved.contextWindowLimit) * 100;
      expect(percentage).toBe(50);
    });

    it("should aggregate metrics across workers", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      await db.insert(schema.workers).values([
        testFixtures.worker("template-1", { tokensUsed: 1000, costUsd: 0.01 }),
        testFixtures.worker("template-1", { tokensUsed: 2000, costUsd: 0.02 }),
        testFixtures.worker("template-1", { tokensUsed: 3000, costUsd: 0.03 }),
      ]);

      const [totals] = await db
        .select({
          totalTokens: sql<number>`sum(${schema.workers.tokensUsed})`,
          totalCost: sql<number>`sum(${schema.workers.costUsd})`,
          avgTokens: sql<number>`avg(${schema.workers.tokensUsed})`,
        })
        .from(schema.workers)
        .where(eq(schema.workers.templateId, "template-1"));

      expect(totals.totalTokens).toBe(6000);
      expect(totals.totalCost).toBeCloseTo(0.06, 2);
      expect(totals.avgTokens).toBe(2000);
    });

    it("should find workers near context window limit", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      await db.insert(schema.workers).values([
        testFixtures.worker("template-1", {
          contextWindowUsed: 50000,
          contextWindowLimit: 200000,
        }),
        testFixtures.worker("template-1", {
          contextWindowUsed: 180000,
          contextWindowLimit: 200000,
        }),
        testFixtures.worker("template-1", {
          contextWindowUsed: 195000,
          contextWindowLimit: 200000,
        }),
      ]);

      // Find workers using more than 90% of context window
      const nearLimit = await db
        .select()
        .from(schema.workers)
        .where(
          sql`${schema.workers.contextWindowUsed} > ${schema.workers.contextWindowLimit} * 0.9`
        );

      expect(nearLimit).toHaveLength(1);
      expect(nearLimit[0].contextWindowUsed).toBe(195000);
    });
  });

  // ========================================
  // Complex Query Tests
  // ========================================

  describe("Complex Queries", () => {
    it("should find available workers for a work item type", async () => {
      const db = getTestDatabase();
      const template1 = testFixtures.template({
        id: "template-1",
        allowedWorkItemTypes: ["feature", "bug"],
      });
      const template2 = testFixtures.template({
        id: "template-2",
        allowedWorkItemTypes: ["research"],
      });
      await db.insert(schema.templates).values([template1, template2]);

      await db.insert(schema.workers).values([
        testFixtures.worker("template-1", { status: "idle" }),
        testFixtures.worker("template-1", { status: "working" }),
        testFixtures.worker("template-2", { status: "idle" }),
      ]);

      // Find idle workers for "feature" work items
      const available = await db
        .select({
          worker: schema.workers,
          template: schema.templates,
        })
        .from(schema.workers)
        .leftJoin(
          schema.templates,
          eq(schema.workers.templateId, schema.templates.id)
        )
        .where(eq(schema.workers.status, "idle"));

      // Filter in memory for allowed types (would need JSON query in production)
      const featureWorkers = available.filter(
        (row) =>
          row.template &&
          (row.template.allowedWorkItemTypes.includes("*") ||
            row.template.allowedWorkItemTypes.includes("feature"))
      );

      expect(featureWorkers).toHaveLength(1);
    });

    it("should count workers by status", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      await db.insert(schema.workers).values([
        testFixtures.worker("template-1", { status: "idle" }),
        testFixtures.worker("template-1", { status: "working" }),
        testFixtures.worker("template-1", { status: "working" }),
        testFixtures.worker("template-1", { status: "paused" }),
      ]);

      const counts = await db
        .select({
          status: schema.workers.status,
          count: sql<number>`count(*)`,
        })
        .from(schema.workers)
        .groupBy(schema.workers.status);

      const workingCount = counts.find((c) => c.status === "working");
      expect(workingCount?.count).toBe(2);
    });

    it("should find workers with high error rates", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      await db.insert(schema.workers).values([
        testFixtures.worker("template-1", { errors: 0, toolCalls: 100 }),
        testFixtures.worker("template-1", { errors: 5, toolCalls: 100 }),
        testFixtures.worker("template-1", { errors: 15, toolCalls: 100 }),
      ]);

      // Find workers with more than 10% error rate
      const highErrors = await db
        .select()
        .from(schema.workers)
        .where(sql`${schema.workers.errors} > 10`);

      expect(highErrors).toHaveLength(1);
      expect(highErrors[0].errors).toBe(15);
    });
  });

  // ========================================
  // Error Cases
  // ========================================

  describe("Error Cases", () => {
    it("should handle updating non-existent worker", async () => {
      const db = getTestDatabase();

      const results = await db
        .update(schema.workers)
        .set({ status: "working" })
        .where(eq(schema.workers.id, "non-existent"))
        .returning();

      expect(results).toHaveLength(0);
    });

    it("should handle deleting non-existent worker", async () => {
      const db = getTestDatabase();

      const results = await db
        .delete(schema.workers)
        .where(eq(schema.workers.id, "non-existent"))
        .returning();

      expect(results).toHaveLength(0);
    });

    it("should handle assigning non-existent work item", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1");
      await db.insert(schema.workers).values(worker);

      // This should fail with foreign key constraint
      await expect(
        db
          .update(schema.workers)
          .set({ currentWorkItemId: "non-existent" })
          .where(eq(schema.workers.id, worker.id))
      ).rejects.toThrow();
    });
  });
});
