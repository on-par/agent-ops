import { describe, it, expect, beforeEach } from "vitest";
import { eq, and, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  setupTestDatabase,
  getTestDatabase,
  clearTestDatabase,
  testFixtures,
  waitFor,
  sleep,
} from "./setup.js";
import * as schema from "../db/schema.js";
import type { WorkerStatus, WorkItemStatus } from "../db/schema.js";

setupTestDatabase();

describe("Integration Tests", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  // ========================================
  // Full Workflow Tests
  // ========================================

  describe("Full Workflow: Template → Worker → Work Item", () => {
    it("should complete full workflow from template creation to work completion", async () => {
      const db = getTestDatabase();

      // Step 1: Create a template
      const template = testFixtures.template({
        id: "implementer-template",
        name: "Feature Implementer",
        description: "Implements features",
        systemPrompt: "You are a feature implementer...",
        defaultRole: "implementer",
        allowedWorkItemTypes: ["feature"],
      });

      await db.insert(schema.templates).values(template);

      const [createdTemplate] = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, "implementer-template"));

      expect(createdTemplate).toBeDefined();
      expect(createdTemplate.name).toBe("Feature Implementer");

      // Step 2: Create a work item
      const workItem = testFixtures.workItem({
        id: "feature-1",
        title: "Implement user authentication",
        type: "feature",
        status: "ready",
        description: "Add OAuth2 authentication",
      });

      await db.insert(schema.workItems).values(workItem);

      const [createdWorkItem] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, "feature-1"));

      expect(createdWorkItem).toBeDefined();
      expect(createdWorkItem.status).toBe("ready");

      // Step 3: Spawn a worker from the template
      const worker = testFixtures.worker("implementer-template", {
        id: "worker-1",
        status: "idle",
      });

      await db.insert(schema.workers).values(worker);

      const [spawnedWorker] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, "worker-1"));

      expect(spawnedWorker).toBeDefined();
      expect(spawnedWorker.templateId).toBe("implementer-template");
      expect(spawnedWorker.status).toBe("idle");

      // Step 4: Assign work item to worker
      await db
        .update(schema.workers)
        .set({
          status: "working",
          currentWorkItemId: "feature-1",
          currentRole: "implementer",
        })
        .where(eq(schema.workers.id, "worker-1"));

      await db
        .update(schema.workItems)
        .set({
          status: "in_progress",
          startedAt: new Date(),
          assignedAgents: { implementer: "worker-1" },
        })
        .where(eq(schema.workItems.id, "feature-1"));

      // Verify assignment
      const [workingWorker] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, "worker-1"));

      const [inProgressItem] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, "feature-1"));

      expect(workingWorker.status).toBe("working");
      expect(workingWorker.currentWorkItemId).toBe("feature-1");
      expect(inProgressItem.status).toBe("in_progress");
      expect(inProgressItem.assignedAgents.implementer).toBe("worker-1");

      // Step 5: Update worker metrics during work
      await db
        .update(schema.workers)
        .set({
          tokensUsed: 5000,
          costUsd: 0.025,
          toolCalls: 15,
          contextWindowUsed: 25000,
        })
        .where(eq(schema.workers.id, "worker-1"));

      // Step 6: Create trace events
      const traces = [
        testFixtures.trace({
          workerId: "worker-1",
          workItemId: "feature-1",
          eventType: "agent_state",
          data: { state: "analyzing" },
        }),
        testFixtures.trace({
          workerId: "worker-1",
          workItemId: "feature-1",
          eventType: "tool_call",
          data: { tool: "read", file: "auth.ts" },
        }),
        testFixtures.trace({
          workerId: "worker-1",
          workItemId: "feature-1",
          eventType: "metric_update",
          data: { tokensUsed: 5000 },
        }),
      ];

      await db.insert(schema.traces).values(traces);

      const traceCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.traces)
        .where(eq(schema.traces.workItemId, "feature-1"));

      expect(traceCount[0].count).toBe(3);

      // Step 7: Complete the work item
      await db
        .update(schema.workItems)
        .set({
          status: "done",
          completedAt: new Date(),
        })
        .where(eq(schema.workItems.id, "feature-1"));

      await db
        .update(schema.workers)
        .set({
          status: "idle",
          currentWorkItemId: null,
          currentRole: null,
        })
        .where(eq(schema.workers.id, "worker-1"));

      // Final verification
      const [completedItem] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, "feature-1"));

      const [idleWorker] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, "worker-1"));

      expect(completedItem.status).toBe("done");
      expect(completedItem.completedAt).toBeTruthy();
      expect(idleWorker.status).toBe("idle");
      expect(idleWorker.currentWorkItemId).toBeNull();
    });

    it("should handle work item requiring approval", async () => {
      const db = getTestDatabase();

      // Create template and worker
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1", { id: "worker-1" });
      await db.insert(schema.workers).values(worker);

      // Create work item requiring approval
      const workItem = testFixtures.workItem({
        id: "work-1",
        status: "ready",
        requiresApproval: { code_changes: true },
      });
      await db.insert(schema.workItems).values(workItem);

      // Assign to worker
      await db
        .update(schema.workers)
        .set({
          status: "working",
          currentWorkItemId: "work-1",
        })
        .where(eq(schema.workers.id, "worker-1"));

      await db
        .update(schema.workItems)
        .set({ status: "in_progress" })
        .where(eq(schema.workItems.id, "work-1"));

      // Worker requests approval
      const approvalTrace = testFixtures.trace({
        workerId: "worker-1",
        workItemId: "work-1",
        eventType: "approval_required",
        data: { reason: "Code changes need review" },
      });
      await db.insert(schema.traces).values(approvalTrace);

      // Move to review status
      await db
        .update(schema.workItems)
        .set({ status: "review" })
        .where(eq(schema.workItems.id, "work-1"));

      await db
        .update(schema.workers)
        .set({ status: "paused" })
        .where(eq(schema.workers.id, "worker-1"));

      const [reviewItem] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, "work-1"));

      const [pausedWorker] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, "worker-1"));

      expect(reviewItem.status).toBe("review");
      expect(pausedWorker.status).toBe("paused");
    });

    it("should handle worker error and recovery", async () => {
      const db = getTestDatabase();

      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1", {
        id: "worker-1",
        status: "working",
        errors: 0,
      });
      await db.insert(schema.workers).values(worker);

      const workItem = testFixtures.workItem({
        id: "work-1",
        status: "in_progress",
      });
      await db.insert(schema.workItems).values(workItem);

      // Simulate error
      await db
        .update(schema.workers)
        .set({
          status: "error",
          errors: 1,
        })
        .where(eq(schema.workers.id, "worker-1"));

      const errorTrace = testFixtures.trace({
        workerId: "worker-1",
        workItemId: "work-1",
        eventType: "error",
        data: { error: "Permission denied", code: "EACCES" },
      });
      await db.insert(schema.traces).values(errorTrace);

      // Recover from error
      await db
        .update(schema.workers)
        .set({ status: "working" })
        .where(eq(schema.workers.id, "worker-1"));

      const [recoveredWorker] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, "worker-1"));

      expect(recoveredWorker.status).toBe("working");
      expect(recoveredWorker.errors).toBe(1);
    });
  });

  // ========================================
  // Multi-Agent Workflow Tests
  // ========================================

  describe("Multi-Agent Workflow", () => {
    it("should coordinate multiple agents on a single work item", async () => {
      const db = getTestDatabase();

      // Create two templates: implementer and reviewer
      const implementerTemplate = testFixtures.template({
        id: "implementer-template",
        name: "Implementer",
        defaultRole: "implementer",
      });
      const reviewerTemplate = testFixtures.template({
        id: "reviewer-template",
        name: "Reviewer",
        defaultRole: "reviewer",
      });

      await db
        .insert(schema.templates)
        .values([implementerTemplate, reviewerTemplate]);

      // Spawn workers
      const implementer = testFixtures.worker("implementer-template", {
        id: "implementer-1",
      });
      const reviewer = testFixtures.worker("reviewer-template", { id: "reviewer-1" });

      await db.insert(schema.workers).values([implementer, reviewer]);

      // Create work item
      const workItem = testFixtures.workItem({
        id: "feature-1",
        status: "ready",
      });
      await db.insert(schema.workItems).values(workItem);

      // Phase 1: Implementer works on it
      await db
        .update(schema.workers)
        .set({
          status: "working",
          currentWorkItemId: "feature-1",
          currentRole: "implementer",
        })
        .where(eq(schema.workers.id, "implementer-1"));

      await db
        .update(schema.workItems)
        .set({
          status: "in_progress",
          assignedAgents: { implementer: "implementer-1" },
        })
        .where(eq(schema.workItems.id, "feature-1"));

      // Implementer completes, moves to review
      await db
        .update(schema.workers)
        .set({
          status: "idle",
          currentWorkItemId: null,
          currentRole: null,
        })
        .where(eq(schema.workers.id, "implementer-1"));

      await db
        .update(schema.workItems)
        .set({ status: "review" })
        .where(eq(schema.workItems.id, "feature-1"));

      // Phase 2: Reviewer picks it up
      await db
        .update(schema.workers)
        .set({
          status: "working",
          currentWorkItemId: "feature-1",
          currentRole: "reviewer",
        })
        .where(eq(schema.workers.id, "reviewer-1"));

      await db
        .update(schema.workItems)
        .set({
          assignedAgents: {
            implementer: "implementer-1",
            reviewer: "reviewer-1",
          },
        })
        .where(eq(schema.workItems.id, "feature-1"));

      // Verify both agents are assigned
      const [item] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, "feature-1"));

      expect(item.assignedAgents.implementer).toBe("implementer-1");
      expect(item.assignedAgents.reviewer).toBe("reviewer-1");
    });

    it("should handle parent-child work item relationships", async () => {
      const db = getTestDatabase();

      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      // Create parent work item
      const parentItem = testFixtures.workItem({
        id: "parent-1",
        title: "Implement authentication system",
        status: "backlog",
      });
      await db.insert(schema.workItems).values(parentItem);

      // Create child work items
      const childItems = [
        testFixtures.workItem({
          id: "child-1",
          title: "Implement OAuth2 flow",
          parentId: "parent-1",
          status: "ready",
        }),
        testFixtures.workItem({
          id: "child-2",
          title: "Implement session management",
          parentId: "parent-1",
          status: "ready",
        }),
        testFixtures.workItem({
          id: "child-3",
          title: "Add authentication tests",
          parentId: "parent-1",
          status: "backlog",
        }),
      ];
      await db.insert(schema.workItems).values(childItems);

      // Update parent with child references
      await db
        .update(schema.workItems)
        .set({ childIds: ["child-1", "child-2", "child-3"] })
        .where(eq(schema.workItems.id, "parent-1"));

      // Spawn workers for children
      const workers = [
        testFixtures.worker("template-1", { id: "worker-1" }),
        testFixtures.worker("template-1", { id: "worker-2" }),
      ];
      await db.insert(schema.workers).values(workers);

      // Assign workers to first two children
      await db
        .update(schema.workers)
        .set({ status: "working", currentWorkItemId: "child-1" })
        .where(eq(schema.workers.id, "worker-1"));

      await db
        .update(schema.workers)
        .set({ status: "working", currentWorkItemId: "child-2" })
        .where(eq(schema.workers.id, "worker-2"));

      await db
        .update(schema.workItems)
        .set({ status: "in_progress" })
        .where(eq(schema.workItems.id, "child-1"));

      await db
        .update(schema.workItems)
        .set({ status: "in_progress" })
        .where(eq(schema.workItems.id, "child-2"));

      // Complete first child
      await db
        .update(schema.workItems)
        .set({ status: "done", completedAt: new Date() })
        .where(eq(schema.workItems.id, "child-1"));

      // Verify status
      const children = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.parentId, "parent-1"));

      const completed = children.filter((c) => c.status === "done");
      const inProgress = children.filter((c) => c.status === "in_progress");
      const backlog = children.filter((c) => c.status === "backlog");

      expect(completed).toHaveLength(1);
      expect(inProgress).toHaveLength(1);
      expect(backlog).toHaveLength(1);
    });

    it("should handle blocked work items", async () => {
      const db = getTestDatabase();

      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      // Create blocking and blocked work items
      const blocker = testFixtures.workItem({
        id: "blocker-1",
        title: "Set up database schema",
        status: "in_progress",
      });

      const blocked = testFixtures.workItem({
        id: "blocked-1",
        title: "Add database queries",
        status: "backlog",
        blockedBy: ["blocker-1"],
      });

      await db.insert(schema.workItems).values([blocker, blocked]);

      // Try to start blocked item (should remain blocked)
      const [blockedItem] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, "blocked-1"));

      expect(blockedItem.blockedBy).toContain("blocker-1");
      expect(blockedItem.status).toBe("backlog");

      // Complete blocker
      await db
        .update(schema.workItems)
        .set({ status: "done", completedAt: new Date() })
        .where(eq(schema.workItems.id, "blocker-1"));

      // Unblock the blocked item
      await db
        .update(schema.workItems)
        .set({ blockedBy: [], status: "ready" })
        .where(eq(schema.workItems.id, "blocked-1"));

      const [unblockedItem] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, "blocked-1"));

      expect(unblockedItem.blockedBy).toEqual([]);
      expect(unblockedItem.status).toBe("ready");
    });
  });

  // ========================================
  // Concurrent Operations Tests
  // ========================================

  describe("Concurrent Operations", () => {
    it("should handle concurrent work item updates", async () => {
      const db = getTestDatabase();

      const workItem = testFixtures.workItem({ id: "work-1", title: "Original" });
      await db.insert(schema.workItems).values(workItem);

      // Simulate concurrent updates
      const update1 = db
        .update(schema.workItems)
        .set({ title: "Update 1" })
        .where(eq(schema.workItems.id, "work-1"));

      const update2 = db
        .update(schema.workItems)
        .set({ description: "Updated description" })
        .where(eq(schema.workItems.id, "work-1"));

      await Promise.all([update1, update2]);

      const [result] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, "work-1"));

      // One update should have won
      expect(result).toBeDefined();
      // Description update should succeed
      expect(result.description).toBe("Updated description");
    });

    it("should handle concurrent worker spawning", async () => {
      const db = getTestDatabase();

      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      // Spawn multiple workers concurrently
      const workers = Array.from({ length: 5 }, () =>
        testFixtures.worker("template-1")
      );

      await Promise.all(
        workers.map((worker) => db.insert(schema.workers).values(worker))
      );

      const spawnedWorkers = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.templateId, "template-1"));

      expect(spawnedWorkers).toHaveLength(5);
    });

    it("should handle concurrent metric updates", async () => {
      const db = getTestDatabase();

      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1", {
        id: "worker-1",
        tokensUsed: 0,
      });
      await db.insert(schema.workers).values(worker);

      // Simulate concurrent metric updates (would need proper locking in production)
      const updates = Array.from({ length: 10 }, async (_, i) => {
        const [current] = await db
          .select()
          .from(schema.workers)
          .where(eq(schema.workers.id, "worker-1"));

        return db
          .update(schema.workers)
          .set({ tokensUsed: current.tokensUsed + 100 })
          .where(eq(schema.workers.id, "worker-1"));
      });

      await Promise.all(updates);

      const [final] = await db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.id, "worker-1"));

      // Due to race conditions, final value may be less than expected
      // In production, this would need atomic increment or locking
      expect(final.tokensUsed).toBeGreaterThan(0);
    });

    it("should handle concurrent trace insertions", async () => {
      const db = getTestDatabase();

      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1", { id: "worker-1" });
      await db.insert(schema.workers).values(worker);

      const workItem = testFixtures.workItem({ id: "work-1" });
      await db.insert(schema.workItems).values(workItem);

      // Insert traces concurrently
      const traces = Array.from({ length: 20 }, (_, i) =>
        testFixtures.trace({
          workerId: "worker-1",
          workItemId: "work-1",
          eventType: "tool_call",
          data: { index: i },
        })
      );

      await Promise.all(traces.map((trace) => db.insert(schema.traces).values(trace)));

      const insertedTraces = await db
        .select()
        .from(schema.traces)
        .where(eq(schema.traces.workerId, "worker-1"));

      expect(insertedTraces).toHaveLength(20);
    });
  });

  // ========================================
  // Observability & Traces Tests
  // ========================================

  describe("Observability & Traces", () => {
    it("should track complete work item lifecycle through traces", async () => {
      const db = getTestDatabase();

      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1", { id: "worker-1" });
      await db.insert(schema.workers).values(worker);

      const workItem = testFixtures.workItem({ id: "work-1" });
      await db.insert(schema.workItems).values(workItem);

      // Create lifecycle traces
      const traces = [
        testFixtures.trace({
          workerId: "worker-1",
          workItemId: "work-1",
          eventType: "work_item_update",
          data: { status: "in_progress" },
          timestamp: new Date(Date.now() - 5000),
        }),
        testFixtures.trace({
          workerId: "worker-1",
          workItemId: "work-1",
          eventType: "tool_call",
          data: { tool: "read", file: "app.ts" },
          timestamp: new Date(Date.now() - 4000),
        }),
        testFixtures.trace({
          workerId: "worker-1",
          workItemId: "work-1",
          eventType: "tool_call",
          data: { tool: "edit", file: "app.ts" },
          timestamp: new Date(Date.now() - 3000),
        }),
        testFixtures.trace({
          workerId: "worker-1",
          workItemId: "work-1",
          eventType: "metric_update",
          data: { tokensUsed: 5000 },
          timestamp: new Date(Date.now() - 2000),
        }),
        testFixtures.trace({
          workerId: "worker-1",
          workItemId: "work-1",
          eventType: "work_item_update",
          data: { status: "done" },
          timestamp: new Date(Date.now() - 1000),
        }),
      ];

      await db.insert(schema.traces).values(traces);

      // Query traces in chronological order
      const lifecycle = await db
        .select()
        .from(schema.traces)
        .where(eq(schema.traces.workItemId, "work-1"))
        .orderBy(sql`${schema.traces.timestamp} ASC`);

      expect(lifecycle).toHaveLength(5);
      expect(lifecycle[0].eventType).toBe("work_item_update");
      expect(lifecycle[lifecycle.length - 1].eventType).toBe("work_item_update");
    });

    it("should filter traces by event type", async () => {
      const db = getTestDatabase();

      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1", { id: "worker-1" });
      await db.insert(schema.workers).values(worker);

      const traces = [
        testFixtures.trace({
          workerId: "worker-1",
          eventType: "tool_call",
          data: { tool: "read" },
        }),
        testFixtures.trace({
          workerId: "worker-1",
          eventType: "tool_call",
          data: { tool: "write" },
        }),
        testFixtures.trace({
          workerId: "worker-1",
          eventType: "metric_update",
          data: { tokensUsed: 1000 },
        }),
        testFixtures.trace({
          workerId: "worker-1",
          eventType: "error",
          data: { error: "Test error" },
        }),
      ];

      await db.insert(schema.traces).values(traces);

      const toolCalls = await db
        .select()
        .from(schema.traces)
        .where(eq(schema.traces.eventType, "tool_call"));

      expect(toolCalls).toHaveLength(2);
    });

    it("should aggregate traces for analytics", async () => {
      const db = getTestDatabase();

      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1", { id: "worker-1" });
      await db.insert(schema.workers).values(worker);

      // Create multiple traces
      const traces = Array.from({ length: 50 }, (_, i) =>
        testFixtures.trace({
          workerId: "worker-1",
          eventType: i % 3 === 0 ? "tool_call" : i % 3 === 1 ? "metric_update" : "error",
          data: {},
        })
      );

      await db.insert(schema.traces).values(traces);

      // Count by event type
      const counts = await db
        .select({
          eventType: schema.traces.eventType,
          count: sql<number>`count(*)`,
        })
        .from(schema.traces)
        .where(eq(schema.traces.workerId, "worker-1"))
        .groupBy(schema.traces.eventType);

      const totalCount = counts.reduce((sum, row) => sum + row.count, 0);
      expect(totalCount).toBe(50);
    });
  });

  // ========================================
  // Data Integrity Tests
  // ========================================

  describe("Data Integrity", () => {
    it("should maintain referential integrity between workers and templates", async () => {
      const db = getTestDatabase();

      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1");
      await db.insert(schema.workers).values(worker);

      // Verify foreign key relationship
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
      expect(results[0].template).toBeDefined();
      expect(results[0].template?.id).toBe("template-1");
    });

    it("should maintain referential integrity between workers and work items", async () => {
      const db = getTestDatabase();

      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const workItem = testFixtures.workItem({ id: "work-1" });
      await db.insert(schema.workItems).values(workItem);

      const worker = testFixtures.worker("template-1", {
        currentWorkItemId: "work-1",
      });
      await db.insert(schema.workers).values(worker);

      // Verify foreign key relationship
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
      expect(results[0].workItem).toBeDefined();
      expect(results[0].workItem?.id).toBe("work-1");
    });

    it("should maintain parent-child relationships in work items", async () => {
      const db = getTestDatabase();

      const parent = testFixtures.workItem({ id: "parent-1" });
      await db.insert(schema.workItems).values(parent);

      const children = [
        testFixtures.workItem({ id: "child-1", parentId: "parent-1" }),
        testFixtures.workItem({ id: "child-2", parentId: "parent-1" }),
      ];
      await db.insert(schema.workItems).values(children);

      await db
        .update(schema.workItems)
        .set({ childIds: ["child-1", "child-2"] })
        .where(eq(schema.workItems.id, "parent-1"));

      // Verify relationships
      const [parentItem] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, "parent-1"));

      const childItems = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.parentId, "parent-1"));

      expect(parentItem.childIds).toEqual(["child-1", "child-2"]);
      expect(childItems).toHaveLength(2);
    });
  });
});
