import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq, and, or, inArray, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  setupTestDatabase,
  getTestDatabase,
  clearTestDatabase,
  testFixtures,
  seedDatabase,
} from "./setup.js";
import * as schema from "../db/schema.js";
import type { WorkItemStatus, WorkItemType } from "../db/schema.js";

setupTestDatabase();

describe("Work Items - Database Operations", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  // ========================================
  // CREATE Tests
  // ========================================

  describe("CREATE", () => {
    it("should create a work item with all fields", async () => {
      const db = getTestDatabase();
      const workItem = testFixtures.workItem({
        title: "Implement authentication",
        type: "feature",
        description: "Add OAuth2 support",
        successCriteria: [
          testFixtures.successCriterion({
            description: "OAuth2 flow works",
            completed: false,
          }),
        ],
      });

      const [created] = await db.insert(schema.workItems).values(workItem).returning();

      expect(created).toBeDefined();
      expect(created.id).toBe(workItem.id);
      expect(created.title).toBe(workItem.title);
      expect(created.type).toBe(workItem.type);
      expect(created.status).toBe("backlog");
      expect(created.successCriteria).toHaveLength(1);
    });

    it("should create a work item with minimal fields", async () => {
      const db = getTestDatabase();
      const now = new Date();
      const workItem = {
        id: uuidv4(),
        title: "Fix bug",
        type: "bug" as WorkItemType,
        createdBy: "user-123",
        createdAt: now,
        updatedAt: now,
      };

      const [created] = await db.insert(schema.workItems).values(workItem).returning();

      expect(created).toBeDefined();
      expect(created.title).toBe(workItem.title);
      expect(created.description).toBe("");
      expect(created.successCriteria).toEqual([]);
      expect(created.linkedFiles).toEqual([]);
      expect(created.childIds).toEqual([]);
      expect(created.blockedBy).toEqual([]);
    });

    it("should create work items with parent-child relationship", async () => {
      const db = getTestDatabase();
      const parent = testFixtures.workItem({
        id: "parent-id",
        title: "Parent task",
      });

      await db.insert(schema.workItems).values(parent);

      const child = testFixtures.workItem({
        id: "child-id",
        title: "Child task",
        parentId: parent.id,
      });

      const [created] = await db.insert(schema.workItems).values(child).returning();

      expect(created.parentId).toBe(parent.id);

      // Update parent with child reference
      await db
        .update(schema.workItems)
        .set({ childIds: [child.id] })
        .where(eq(schema.workItems.id, parent.id));

      const [updated] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, parent.id));

      expect(updated.childIds).toContain(child.id);
    });

    it("should create work item with linked files", async () => {
      const db = getTestDatabase();
      const workItem = testFixtures.workItem({
        title: "Update documentation",
        linkedFiles: ["/docs/README.md", "/docs/API.md"],
      });

      const [created] = await db.insert(schema.workItems).values(workItem).returning();

      expect(created.linkedFiles).toEqual(["/docs/README.md", "/docs/API.md"]);
    });

    it("should create work item with assigned agents", async () => {
      const db = getTestDatabase();
      const workItem = testFixtures.workItem({
        title: "Code review",
        assignedAgents: {
          reviewer: "worker-1",
          tester: "worker-2",
        },
      });

      const [created] = await db.insert(schema.workItems).values(workItem).returning();

      expect(created.assignedAgents).toEqual({
        reviewer: "worker-1",
        tester: "worker-2",
      });
    });

    it("should reject work item without required fields", async () => {
      const db = getTestDatabase();
      const invalid = {
        id: uuidv4(),
        // Missing title, type, createdBy, createdAt, updatedAt
      };

      await expect(
        db.insert(schema.workItems).values(invalid as any)
      ).rejects.toThrow();
    });
  });

  // ========================================
  // READ Tests
  // ========================================

  describe("READ", () => {
    it("should read a work item by ID", async () => {
      const db = getTestDatabase();
      const workItem = testFixtures.workItem({ id: "work-item-123" });
      await db.insert(schema.workItems).values(workItem);

      const [found] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, "work-item-123"));

      expect(found).toBeDefined();
      expect(found.id).toBe("work-item-123");
      expect(found.title).toBe(workItem.title);
    });

    it("should return undefined for non-existent ID", async () => {
      const db = getTestDatabase();

      const results = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, "non-existent"));

      expect(results).toHaveLength(0);
    });

    it("should list all work items", async () => {
      const db = getTestDatabase();
      const workItem1 = testFixtures.workItem({ title: "Task 1" });
      const workItem2 = testFixtures.workItem({ title: "Task 2" });
      const workItem3 = testFixtures.workItem({ title: "Task 3" });

      await db.insert(schema.workItems).values([workItem1, workItem2, workItem3]);

      const results = await db.select().from(schema.workItems);

      expect(results).toHaveLength(3);
    });

    it("should filter work items by type", async () => {
      const db = getTestDatabase();
      await db.insert(schema.workItems).values([
        testFixtures.workItem({ type: "feature" }),
        testFixtures.workItem({ type: "bug" }),
        testFixtures.workItem({ type: "feature" }),
      ]);

      const features = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.type, "feature"));

      expect(features).toHaveLength(2);
      expect(features.every((item) => item.type === "feature")).toBe(true);
    });

    it("should filter work items by status", async () => {
      const db = getTestDatabase();
      await db.insert(schema.workItems).values([
        testFixtures.workItem({ status: "backlog" }),
        testFixtures.workItem({ status: "in_progress" }),
        testFixtures.workItem({ status: "in_progress" }),
        testFixtures.workItem({ status: "done" }),
      ]);

      const inProgress = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.status, "in_progress"));

      expect(inProgress).toHaveLength(2);
      expect(inProgress.every((item) => item.status === "in_progress")).toBe(true);
    });

    it("should filter work items by multiple statuses", async () => {
      const db = getTestDatabase();
      await db.insert(schema.workItems).values([
        testFixtures.workItem({ status: "backlog" }),
        testFixtures.workItem({ status: "ready" }),
        testFixtures.workItem({ status: "in_progress" }),
        testFixtures.workItem({ status: "done" }),
      ]);

      const results = await db
        .select()
        .from(schema.workItems)
        .where(inArray(schema.workItems.status, ["backlog", "ready"]));

      expect(results).toHaveLength(2);
    });

    it("should filter work items by createdBy", async () => {
      const db = getTestDatabase();
      await db.insert(schema.workItems).values([
        testFixtures.workItem({ createdBy: "user-1" }),
        testFixtures.workItem({ createdBy: "user-2" }),
        testFixtures.workItem({ createdBy: "user-1" }),
      ]);

      const user1Items = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.createdBy, "user-1"));

      expect(user1Items).toHaveLength(2);
    });

    it("should filter work items by parent ID", async () => {
      const db = getTestDatabase();
      const parentId = "parent-123";

      await db.insert(schema.workItems).values([
        testFixtures.workItem({ id: parentId }),
        testFixtures.workItem({ parentId }),
        testFixtures.workItem({ parentId }),
        testFixtures.workItem({ parentId: null }),
      ]);

      const children = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.parentId, parentId));

      expect(children).toHaveLength(2);
    });

    it("should sort work items by createdAt DESC", async () => {
      const db = getTestDatabase();
      const now = Date.now();

      await db.insert(schema.workItems).values([
        testFixtures.workItem({ id: "1", createdAt: new Date(now - 3000) }),
        testFixtures.workItem({ id: "2", createdAt: new Date(now - 1000) }),
        testFixtures.workItem({ id: "3", createdAt: new Date(now - 2000) }),
      ]);

      const results = await db
        .select()
        .from(schema.workItems)
        .orderBy(sql`${schema.workItems.createdAt} DESC`);

      expect(results[0].id).toBe("2"); // Most recent
      expect(results[1].id).toBe("3");
      expect(results[2].id).toBe("1"); // Oldest
    });

    it("should paginate work items", async () => {
      const db = getTestDatabase();
      const items = Array.from({ length: 25 }, (_, i) =>
        testFixtures.workItem({ title: `Task ${i}` })
      );
      await db.insert(schema.workItems).values(items);

      // Page 1
      const page1 = await db.select().from(schema.workItems).limit(10).offset(0);
      expect(page1).toHaveLength(10);

      // Page 2
      const page2 = await db.select().from(schema.workItems).limit(10).offset(10);
      expect(page2).toHaveLength(10);

      // Page 3
      const page3 = await db.select().from(schema.workItems).limit(10).offset(20);
      expect(page3).toHaveLength(5);
    });

    it("should combine filters and pagination", async () => {
      const db = getTestDatabase();
      const items = Array.from({ length: 20 }, (_, i) =>
        testFixtures.workItem({
          type: i % 2 === 0 ? "feature" : "bug",
          status: "backlog",
        })
      );
      await db.insert(schema.workItems).values(items);

      const results = await db
        .select()
        .from(schema.workItems)
        .where(
          and(
            eq(schema.workItems.type, "feature"),
            eq(schema.workItems.status, "backlog")
          )
        )
        .limit(5)
        .offset(0);

      expect(results).toHaveLength(5);
      expect(results.every((item) => item.type === "feature")).toBe(true);
    });
  });

  // ========================================
  // UPDATE Tests
  // ========================================

  describe("UPDATE", () => {
    it("should update work item title", async () => {
      const db = getTestDatabase();
      const workItem = testFixtures.workItem({ title: "Old title" });
      await db.insert(schema.workItems).values(workItem);

      await db
        .update(schema.workItems)
        .set({ title: "New title", updatedAt: new Date() })
        .where(eq(schema.workItems.id, workItem.id));

      const [updated] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, workItem.id));

      expect(updated.title).toBe("New title");
    });

    it("should update work item status", async () => {
      const db = getTestDatabase();
      const workItem = testFixtures.workItem({ status: "backlog" });
      await db.insert(schema.workItems).values(workItem);

      await db
        .update(schema.workItems)
        .set({ status: "in_progress", updatedAt: new Date() })
        .where(eq(schema.workItems.id, workItem.id));

      const [updated] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, workItem.id));

      expect(updated.status).toBe("in_progress");
    });

    it("should update work item with multiple fields", async () => {
      const db = getTestDatabase();
      const workItem = testFixtures.workItem();
      await db.insert(schema.workItems).values(workItem);

      const now = new Date();
      await db
        .update(schema.workItems)
        .set({
          title: "Updated title",
          description: "Updated description",
          status: "ready",
          updatedAt: now,
        })
        .where(eq(schema.workItems.id, workItem.id));

      const [updated] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, workItem.id));

      expect(updated.title).toBe("Updated title");
      expect(updated.description).toBe("Updated description");
      expect(updated.status).toBe("ready");
    });

    it("should update success criteria", async () => {
      const db = getTestDatabase();
      const workItem = testFixtures.workItem({
        successCriteria: [
          testFixtures.successCriterion({ id: "criterion-1", completed: false }),
        ],
      });
      await db.insert(schema.workItems).values(workItem);

      const updatedCriteria = [
        { ...workItem.successCriteria[0], completed: true, verifiedBy: "user-123" },
      ];

      await db
        .update(schema.workItems)
        .set({ successCriteria: updatedCriteria, updatedAt: new Date() })
        .where(eq(schema.workItems.id, workItem.id));

      const [updated] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, workItem.id));

      expect(updated.successCriteria[0].completed).toBe(true);
      expect(updated.successCriteria[0].verifiedBy).toBe("user-123");
    });

    it("should update assigned agents", async () => {
      const db = getTestDatabase();
      const workItem = testFixtures.workItem({
        assignedAgents: { implementer: "worker-1" },
      });
      await db.insert(schema.workItems).values(workItem);

      await db
        .update(schema.workItems)
        .set({
          assignedAgents: {
            implementer: "worker-1",
            reviewer: "worker-2",
          },
          updatedAt: new Date(),
        })
        .where(eq(schema.workItems.id, workItem.id));

      const [updated] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, workItem.id));

      expect(updated.assignedAgents).toEqual({
        implementer: "worker-1",
        reviewer: "worker-2",
      });
    });

    it("should set startedAt when status changes to in_progress", async () => {
      const db = getTestDatabase();
      const workItem = testFixtures.workItem({ status: "ready" });
      await db.insert(schema.workItems).values(workItem);

      const now = new Date();
      await db
        .update(schema.workItems)
        .set({
          status: "in_progress",
          startedAt: now,
          updatedAt: now,
        })
        .where(eq(schema.workItems.id, workItem.id));

      const [updated] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, workItem.id));

      expect(updated.status).toBe("in_progress");
      expect(updated.startedAt).toBeTruthy();
    });

    it("should set completedAt when status changes to done", async () => {
      const db = getTestDatabase();
      const workItem = testFixtures.workItem({ status: "review" });
      await db.insert(schema.workItems).values(workItem);

      const now = new Date();
      await db
        .update(schema.workItems)
        .set({
          status: "done",
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(schema.workItems.id, workItem.id));

      const [updated] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, workItem.id));

      expect(updated.status).toBe("done");
      expect(updated.completedAt).toBeTruthy();
    });

    it("should update blocked_by array", async () => {
      const db = getTestDatabase();
      const blocker = testFixtures.workItem({ id: "blocker-1" });
      const workItem = testFixtures.workItem({ blockedBy: [] });

      await db.insert(schema.workItems).values([blocker, workItem]);

      await db
        .update(schema.workItems)
        .set({ blockedBy: ["blocker-1"], updatedAt: new Date() })
        .where(eq(schema.workItems.id, workItem.id));

      const [updated] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, workItem.id));

      expect(updated.blockedBy).toContain("blocker-1");
    });

    it("should return updated work item", async () => {
      const db = getTestDatabase();
      const workItem = testFixtures.workItem();
      await db.insert(schema.workItems).values(workItem);

      const [updated] = await db
        .update(schema.workItems)
        .set({ title: "New title", updatedAt: new Date() })
        .where(eq(schema.workItems.id, workItem.id))
        .returning();

      expect(updated).toBeDefined();
      expect(updated.title).toBe("New title");
    });
  });

  // ========================================
  // DELETE Tests
  // ========================================

  describe("DELETE", () => {
    it("should delete a work item by ID", async () => {
      const db = getTestDatabase();
      const workItem = testFixtures.workItem();
      await db.insert(schema.workItems).values(workItem);

      await db.delete(schema.workItems).where(eq(schema.workItems.id, workItem.id));

      const results = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, workItem.id));

      expect(results).toHaveLength(0);
    });

    it("should delete multiple work items", async () => {
      const db = getTestDatabase();
      const items = [
        testFixtures.workItem({ status: "done" }),
        testFixtures.workItem({ status: "done" }),
        testFixtures.workItem({ status: "backlog" }),
      ];
      await db.insert(schema.workItems).values(items);

      await db.delete(schema.workItems).where(eq(schema.workItems.status, "done"));

      const remaining = await db.select().from(schema.workItems);

      expect(remaining).toHaveLength(1);
      expect(remaining[0].status).toBe("backlog");
    });

    it("should return deleted work item", async () => {
      const db = getTestDatabase();
      const workItem = testFixtures.workItem();
      await db.insert(schema.workItems).values(workItem);

      const [deleted] = await db
        .delete(schema.workItems)
        .where(eq(schema.workItems.id, workItem.id))
        .returning();

      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(workItem.id);
    });
  });

  // ========================================
  // Status Workflow Tests
  // ========================================

  describe("Status Workflow", () => {
    it("should support status transition: backlog → ready", async () => {
      const db = getTestDatabase();
      const workItem = testFixtures.workItem({ status: "backlog" });
      await db.insert(schema.workItems).values(workItem);

      await db
        .update(schema.workItems)
        .set({ status: "ready", updatedAt: new Date() })
        .where(eq(schema.workItems.id, workItem.id));

      const [updated] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, workItem.id));

      expect(updated.status).toBe("ready");
    });

    it("should support status transition: ready → in_progress", async () => {
      const db = getTestDatabase();
      const workItem = testFixtures.workItem({ status: "ready" });
      await db.insert(schema.workItems).values(workItem);

      const now = new Date();
      await db
        .update(schema.workItems)
        .set({ status: "in_progress", startedAt: now, updatedAt: now })
        .where(eq(schema.workItems.id, workItem.id));

      const [updated] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, workItem.id));

      expect(updated.status).toBe("in_progress");
      expect(updated.startedAt).toBeTruthy();
    });

    it("should support status transition: in_progress → review", async () => {
      const db = getTestDatabase();
      const workItem = testFixtures.workItem({ status: "in_progress" });
      await db.insert(schema.workItems).values(workItem);

      await db
        .update(schema.workItems)
        .set({ status: "review", updatedAt: new Date() })
        .where(eq(schema.workItems.id, workItem.id));

      const [updated] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, workItem.id));

      expect(updated.status).toBe("review");
    });

    it("should support status transition: review → done", async () => {
      const db = getTestDatabase();
      const workItem = testFixtures.workItem({ status: "review" });
      await db.insert(schema.workItems).values(workItem);

      const now = new Date();
      await db
        .update(schema.workItems)
        .set({ status: "done", completedAt: now, updatedAt: now })
        .where(eq(schema.workItems.id, workItem.id));

      const [updated] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, workItem.id));

      expect(updated.status).toBe("done");
      expect(updated.completedAt).toBeTruthy();
    });

    it("should support status rollback: review → in_progress", async () => {
      const db = getTestDatabase();
      const workItem = testFixtures.workItem({ status: "review" });
      await db.insert(schema.workItems).values(workItem);

      await db
        .update(schema.workItems)
        .set({ status: "in_progress", updatedAt: new Date() })
        .where(eq(schema.workItems.id, workItem.id));

      const [updated] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, workItem.id));

      expect(updated.status).toBe("in_progress");
    });
  });

  // ========================================
  // Complex Query Tests
  // ========================================

  describe("Complex Queries", () => {
    it("should find work items ready to be worked on", async () => {
      const db = getTestDatabase();
      await seedDatabase(db);

      // Ready work items are those with status 'ready' and not blocked
      const ready = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.status, "ready"));

      expect(ready.length).toBeGreaterThan(0);
      expect(ready.every((item) => item.status === "ready")).toBe(true);
    });

    it("should find work items assigned to a specific worker", async () => {
      const db = getTestDatabase();
      const workItem = testFixtures.workItem({
        assignedAgents: { implementer: "worker-123" },
      });
      await db.insert(schema.workItems).values(workItem);

      // This would require a JSON query in production
      // For now, we fetch all and filter in memory
      const all = await db.select().from(schema.workItems);
      const assigned = all.filter(
        (item) =>
          item.assignedAgents &&
          Object.values(item.assignedAgents).includes("worker-123")
      );

      expect(assigned).toHaveLength(1);
    });

    it("should count work items by status", async () => {
      const db = getTestDatabase();
      await db.insert(schema.workItems).values([
        testFixtures.workItem({ status: "backlog" }),
        testFixtures.workItem({ status: "backlog" }),
        testFixtures.workItem({ status: "in_progress" }),
        testFixtures.workItem({ status: "done" }),
      ]);

      const counts = await db
        .select({
          status: schema.workItems.status,
          count: sql<number>`count(*)`,
        })
        .from(schema.workItems)
        .groupBy(schema.workItems.status);

      const backlogCount = counts.find((c) => c.status === "backlog");
      expect(backlogCount?.count).toBe(2);
    });

    it("should find work items created in the last 24 hours", async () => {
      const db = getTestDatabase();
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;

      await db.insert(schema.workItems).values([
        testFixtures.workItem({ createdAt: new Date(now - 1000) }), // Recent
        testFixtures.workItem({ createdAt: new Date(now - 12 * 60 * 60 * 1000) }), // Recent
        testFixtures.workItem({ createdAt: new Date(now - 48 * 60 * 60 * 1000) }), // Old
      ]);

      const recent = await db
        .select()
        .from(schema.workItems)
        .where(sql`${schema.workItems.createdAt} > ${oneDayAgo}`);

      expect(recent).toHaveLength(2);
    });
  });

  // ========================================
  // Error Cases
  // ========================================

  describe("Error Cases", () => {
    it("should handle updating non-existent work item", async () => {
      const db = getTestDatabase();

      const results = await db
        .update(schema.workItems)
        .set({ title: "New title", updatedAt: new Date() })
        .where(eq(schema.workItems.id, "non-existent"))
        .returning();

      expect(results).toHaveLength(0);
    });

    it("should handle deleting non-existent work item", async () => {
      const db = getTestDatabase();

      const results = await db
        .delete(schema.workItems)
        .where(eq(schema.workItems.id, "non-existent"))
        .returning();

      expect(results).toHaveLength(0);
    });

    it("should handle concurrent updates gracefully", async () => {
      const db = getTestDatabase();
      const workItem = testFixtures.workItem({ title: "Original" });
      await db.insert(schema.workItems).values(workItem);

      // Simulate concurrent updates
      await Promise.all([
        db
          .update(schema.workItems)
          .set({ title: "Update 1", updatedAt: new Date() })
          .where(eq(schema.workItems.id, workItem.id)),
        db
          .update(schema.workItems)
          .set({ title: "Update 2", updatedAt: new Date() })
          .where(eq(schema.workItems.id, workItem.id)),
      ]);

      const [result] = await db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.id, workItem.id));

      // One of the updates should win
      expect(result.title).toMatch(/Update [12]/);
    });
  });
});
