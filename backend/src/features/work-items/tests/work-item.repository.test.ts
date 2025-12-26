import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../../shared/db/schema.js";
import { WorkItemRepository } from "../repositories/work-item.repository.js";
import type { NewWorkItem } from "../../../shared/db/schema.js";
import { v4 as uuidv4 } from "uuid";

describe("WorkItemRepository", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let repository: WorkItemRepository;

  beforeEach(async () => {
    // Create in-memory database for testing
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    db = drizzle(sqlite, { schema });

    // Create tables manually (since we don't have migration files in test)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS work_items (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'backlog',
        priority TEXT NOT NULL DEFAULT 'P3',
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
    `);

    repository = new WorkItemRepository(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("findRecentByStatus", () => {
    it("should return most recent work items with given status ordered by completedAt desc", async () => {
      // Arrange: Create 7 work items with status "done" and different completedAt dates
      const now = Date.now();
      const workItems: NewWorkItem[] = [];

      for (let i = 0; i < 7; i++) {
        const completedAt = new Date(now - i * 60000); // Each 1 minute apart
        workItems.push({
          id: uuidv4(),
          title: `Work Item ${i}`,
          type: "task",
          status: "done",
          priority: "P3",
          createdBy: "test-user",
          description: "Test work item",
          createdAt: new Date(now - 7 * 60000),
          updatedAt: new Date(),
          completedAt,
        });
      }

      // Insert in random order to ensure ordering is by completedAt, not insertion order
      for (const item of workItems) {
        await repository.create(item);
      }

      // Act: Call findRecentByStatus("done", 5)
      const recent = await repository.findRecentByStatus("done", 5);

      // Assert: Returns exactly 5 items, ordered by completedAt descending
      expect(recent).toHaveLength(5);
      expect(recent[0]?.title).toBe("Work Item 0"); // Most recent
      expect(recent[1]?.title).toBe("Work Item 1");
      expect(recent[2]?.title).toBe("Work Item 2");
      expect(recent[3]?.title).toBe("Work Item 3");
      expect(recent[4]?.title).toBe("Work Item 4");
    });

    it("should return empty array when no items with given status", async () => {
      // Arrange: Create work items with different status
      const item: NewWorkItem = {
        id: uuidv4(),
        title: "Backlog Item",
        type: "task",
        status: "backlog",
        priority: "P3",
        createdBy: "test-user",
        description: "Test",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await repository.create(item);

      // Act
      const recent = await repository.findRecentByStatus("done", 5);

      // Assert
      expect(recent).toHaveLength(0);
    });

    it("should return fewer items if total count is less than limit", async () => {
      // Arrange: Create only 3 done items
      for (let i = 0; i < 3; i++) {
        const item: NewWorkItem = {
          id: uuidv4(),
          title: `Done Item ${i}`,
          type: "task",
          status: "done",
          priority: "P3",
          createdBy: "test-user",
          description: "Test",
          createdAt: new Date(),
          updatedAt: new Date(),
          completedAt: new Date(Date.now() - i * 60000),
        };
        await repository.create(item);
      }

      // Act: Request 5 but only 3 exist
      const recent = await repository.findRecentByStatus("done", 5);

      // Assert
      expect(recent).toHaveLength(3);
    });
  });
});
