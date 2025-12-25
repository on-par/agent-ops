import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../../shared/db/schema.js";
import { DashboardService } from "../services/dashboard.service.js";
import type { NewRepository, NewWorker, NewWorkItem, NewAgentExecution } from "../../../shared/db/schema.js";

describe("DashboardService", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: DashboardService;

  beforeEach(async () => {
    // Create in-memory database for testing
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    db = drizzle(sqlite, { schema });

    // Create all required tables matching actual schema
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS repositories (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL,
        github_repo_id INTEGER NOT NULL,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        full_name TEXT NOT NULL UNIQUE,
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
        name TEXT NOT NULL
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
        last_heartbeat INTEGER,
        terminated_at INTEGER
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
        priority TEXT NOT NULL DEFAULT 'medium',
        estimated_effort INTEGER,
        actual_effort INTEGER,
        parent_id TEXT,
        child_ids TEXT NOT NULL DEFAULT '[]',
        blocked_by TEXT,
        assigned_agents TEXT,
        requires_approval TEXT NOT NULL DEFAULT '{}',
        metadata TEXT,
        created_by TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL
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
        created_at INTEGER NOT NULL
      );

      -- Insert a dummy template for workers
      INSERT INTO templates (id, name) VALUES ('template-1', 'Test Template');
    `);

    // Create service
    service = new DashboardService(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("getDashboardData", () => {
    it("should aggregate repository stats by sync status", async () => {
      // Arrange: Create repositories with different sync statuses
      const repos: NewRepository[] = [
        {
          id: "repo-1",
          connectionId: "conn-1",
          githubRepoId: 1,
          owner: "owner",
          name: "repo1",
          fullName: "owner/repo1",
          htmlUrl: "https://github.com/owner/repo1",
          description: null,
          defaultBranch: "main",
          isPrivate: false,
          syncEnabled: true,
          syncStatus: "pending",
          syncError: null,
          lastSyncAt: null,
          issueLabelsFilter: [],
          autoAssignAgents: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "repo-2",
          connectionId: "conn-1",
          githubRepoId: 2,
          owner: "owner",
          name: "repo2",
          fullName: "owner/repo2",
          htmlUrl: "https://github.com/owner/repo2",
          description: null,
          defaultBranch: "main",
          isPrivate: false,
          syncEnabled: true,
          syncStatus: "syncing",
          syncError: null,
          lastSyncAt: null,
          issueLabelsFilter: [],
          autoAssignAgents: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "repo-3",
          connectionId: "conn-1",
          githubRepoId: 3,
          owner: "owner",
          name: "repo3",
          fullName: "owner/repo3",
          htmlUrl: "https://github.com/owner/repo3",
          description: null,
          defaultBranch: "main",
          isPrivate: false,
          syncEnabled: true,
          syncStatus: "synced",
          syncError: null,
          lastSyncAt: new Date(),
          issueLabelsFilter: [],
          autoAssignAgents: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "repo-4",
          connectionId: "conn-1",
          githubRepoId: 4,
          owner: "owner",
          name: "repo4",
          fullName: "owner/repo4",
          htmlUrl: "https://github.com/owner/repo4",
          description: null,
          defaultBranch: "main",
          isPrivate: false,
          syncEnabled: true,
          syncStatus: "error",
          syncError: "Sync failed",
          lastSyncAt: null,
          issueLabelsFilter: [],
          autoAssignAgents: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      await db.insert(schema.repositories).values(repos);

      // Act
      const result = await service.getDashboardData();

      // Assert
      expect(result.repositories).toEqual({
        pending: 1,
        syncing: 1,
        synced: 1,
        error: 1,
      });
    });

    it("should aggregate agent stats by worker status", async () => {
      // Arrange: Create workers with different statuses
      const workers: NewWorker[] = [
        {
          id: "worker-1",
          templateId: "template-1",
          status: "idle",
          currentWorkItemId: null,
          currentRole: null,
          sessionId: "session-1",
          spawnedAt: new Date(),
          contextWindowUsed: 0,
          contextWindowLimit: 200000,
          tokensUsed: 0,
          costUsd: 0,
          toolCalls: 0,
          errors: 0,
          lastHeartbeat: null,
          terminatedAt: null,
        },
        {
          id: "worker-2",
          templateId: "template-1",
          status: "working",
          currentWorkItemId: "work-1",
          currentRole: "implementer",
          sessionId: "session-2",
          spawnedAt: new Date(),
          contextWindowUsed: 5000,
          contextWindowLimit: 200000,
          tokensUsed: 1000,
          costUsd: 0.05,
          toolCalls: 10,
          errors: 0,
          lastHeartbeat: new Date(),
          terminatedAt: null,
        },
        {
          id: "worker-3",
          templateId: "template-1",
          status: "paused",
          currentWorkItemId: null,
          currentRole: null,
          sessionId: "session-3",
          spawnedAt: new Date(),
          contextWindowUsed: 0,
          contextWindowLimit: 200000,
          tokensUsed: 0,
          costUsd: 0,
          toolCalls: 0,
          errors: 0,
          lastHeartbeat: null,
          terminatedAt: null,
        },
        {
          id: "worker-4",
          templateId: "template-1",
          status: "error",
          currentWorkItemId: null,
          currentRole: null,
          sessionId: "session-4",
          spawnedAt: new Date(),
          contextWindowUsed: 3000,
          contextWindowLimit: 200000,
          tokensUsed: 500,
          costUsd: 0.02,
          toolCalls: 5,
          errors: 1,
          lastHeartbeat: new Date(),
          terminatedAt: null,
        },
        {
          id: "worker-5",
          templateId: "template-1",
          status: "terminated",
          currentWorkItemId: null,
          currentRole: null,
          sessionId: "session-5",
          spawnedAt: new Date(),
          contextWindowUsed: 0,
          contextWindowLimit: 200000,
          tokensUsed: 0,
          costUsd: 0,
          toolCalls: 0,
          lastHeartbeat: null,
          terminatedAt: new Date(),
        },
      ];

      await db.insert(schema.workers).values(workers);

      // Act
      const result = await service.getDashboardData();

      // Assert
      expect(result.agents).toEqual({
        idle: 1,
        working: 1,
        paused: 1,
        error: 1,
        terminated: 1,
      });
    });

    it("should return work item counts by status using countByStatus()", async () => {
      // Arrange: Create work items with different statuses
      const workItems: NewWorkItem[] = [
        {
          id: "work-1",
          title: "Backlog Item",
          type: "feature",
          status: "backlog",
          repositoryId: null,
          githubIssueId: null,
          githubIssueNumber: null,
          githubIssueUrl: null,
          githubPrNumber: null,
          githubPrUrl: null,
          description: "Description",
          successCriteria: [],
          linkedFiles: [],
          priority: "medium",
          estimatedEffort: null,
          actualEffort: null,
          parentId: null,
          childIds: [],
          blockedBy: null,
          assignedAgents: null,
          requiresApproval: {},
          metadata: null,
          createdBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          startedAt: null,
          completedAt: null,
        },
        {
          id: "work-2",
          title: "Ready Item",
          type: "feature",
          status: "ready",
          repositoryId: null,
          githubIssueId: null,
          githubIssueNumber: null,
          githubIssueUrl: null,
          githubPrNumber: null,
          githubPrUrl: null,
          description: "Description",
          successCriteria: [],
          linkedFiles: [],
          priority: "high",
          estimatedEffort: null,
          actualEffort: null,
          parentId: null,
          childIds: [],
          blockedBy: null,
          assignedAgents: null,
          requiresApproval: {},
          metadata: null,
          createdBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          startedAt: null,
          completedAt: null,
        },
        {
          id: "work-3",
          title: "In Progress Item",
          type: "feature",
          status: "in_progress",
          repositoryId: null,
          githubIssueId: null,
          githubIssueNumber: null,
          githubIssueUrl: null,
          githubPrNumber: null,
          githubPrUrl: null,
          description: "Description",
          successCriteria: [],
          linkedFiles: [],
          priority: "high",
          estimatedEffort: null,
          actualEffort: null,
          parentId: null,
          childIds: [],
          blockedBy: null,
          assignedAgents: null,
          requiresApproval: {},
          metadata: null,
          createdBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          startedAt: new Date(),
          completedAt: null,
        },
        {
          id: "work-4",
          title: "Review Item",
          type: "feature",
          status: "review",
          repositoryId: null,
          githubIssueId: null,
          githubIssueNumber: null,
          githubIssueUrl: null,
          githubPrNumber: null,
          githubPrUrl: null,
          description: "Description",
          successCriteria: [],
          linkedFiles: [],
          priority: "medium",
          estimatedEffort: null,
          actualEffort: null,
          parentId: null,
          childIds: [],
          blockedBy: null,
          assignedAgents: null,
          requiresApproval: {},
          metadata: null,
          createdBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          startedAt: new Date(),
          completedAt: null,
        },
        {
          id: "work-5",
          title: "Done Item",
          type: "feature",
          status: "done",
          repositoryId: null,
          githubIssueId: null,
          githubIssueNumber: null,
          githubIssueUrl: null,
          githubPrNumber: null,
          githubPrUrl: null,
          description: "Description",
          successCriteria: [],
          linkedFiles: [],
          priority: "medium",
          estimatedEffort: null,
          actualEffort: null,
          parentId: null,
          childIds: [],
          blockedBy: null,
          assignedAgents: null,
          requiresApproval: {},
          metadata: null,
          createdBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          startedAt: new Date(),
          completedAt: new Date(),
        },
      ];

      await db.insert(schema.workItems).values(workItems);

      // Act
      const result = await service.getDashboardData();

      // Assert
      expect(result.workItems).toEqual({
        backlog: 1,
        ready: 1,
        in_progress: 1,
        review: 1,
        done: 1,
      });
    });

    it("should return recent completions using findRecentByStatus('done', 5)", async () => {
      // Arrange: Create multiple completed work items with different completion times
      const now = new Date();
      const workItems: NewWorkItem[] = [];

      for (let i = 1; i <= 7; i++) {
        const completedAt = new Date(now.getTime() - i * 60000); // Each 1 minute apart
        workItems.push({
          id: `work-${i}`,
          title: `Completed Item ${i}`,
          type: "feature",
          status: "done",
          repositoryId: null,
          githubIssueId: null,
          githubIssueNumber: null,
          githubIssueUrl: null,
          githubPrNumber: null,
          githubPrUrl: null,
          description: "Description",
          successCriteria: [],
          linkedFiles: [],
          priority: "medium",
          estimatedEffort: null,
          actualEffort: null,
          parentId: null,
          childIds: [],
          blockedBy: null,
          assignedAgents: null,
          requiresApproval: {},
          metadata: null,
          createdBy: null,
          createdAt: new Date(now.getTime() - i * 120000),
          updatedAt: completedAt,
          startedAt: new Date(now.getTime() - i * 90000),
          completedAt: completedAt,
        });
      }

      await db.insert(schema.workItems).values(workItems);

      // Act
      const result = await service.getDashboardData();

      // Assert
      expect(result.recentCompletions).toHaveLength(5);
      expect(result.recentCompletions[0]?.id).toBe("work-1"); // Most recent
      expect(result.recentCompletions[4]?.id).toBe("work-5"); // 5th most recent
    });

    it("should return recent executions using findRecent(10)", async () => {
      // Arrange: Create multiple executions
      const now = new Date();
      const executions: NewAgentExecution[] = [];

      for (let i = 1; i <= 12; i++) {
        const createdAt = new Date(now.getTime() - i * 60000); // Each 1 minute apart
        executions.push({
          id: `exec-${i}`,
          workerId: "worker-1",
          workItemId: `work-${i}`,
          workspaceId: null,
          templateId: "template-1",
          status: "success",
          startedAt: new Date(createdAt.getTime() + 1000),
          completedAt: new Date(createdAt.getTime() + 5000),
          durationMs: 4000,
          tokensUsed: 100,
          costUsd: 0.01,
          toolCallsCount: 5,
          errorMessage: null,
          output: null,
          createdAt: createdAt,
        });
      }

      await db.insert(schema.agentExecutions).values(executions);

      // Act
      const result = await service.getDashboardData();

      // Assert
      expect(result.recentExecutions).toHaveLength(10);
      expect(result.recentExecutions[0]?.id).toBe("exec-1"); // Most recent
      expect(result.recentExecutions[9]?.id).toBe("exec-10"); // 10th most recent
    });

    it("should handle empty database gracefully", async () => {
      // Arrange: Empty database (no data inserted)

      // Act
      const result = await service.getDashboardData();

      // Assert
      expect(result.repositories).toEqual({
        pending: 0,
        syncing: 0,
        synced: 0,
        error: 0,
      });
      expect(result.agents).toEqual({
        idle: 0,
        working: 0,
        paused: 0,
        error: 0,
        terminated: 0,
      });
      expect(result.workItems).toEqual({
        backlog: 0,
        ready: 0,
        in_progress: 0,
        review: 0,
        done: 0,
      });
      expect(result.recentCompletions).toEqual([]);
      expect(result.recentExecutions).toEqual([]);
    });
  });

  describe("Cache behavior", () => {
    it("should return cached data within 5s TTL", async () => {
      // Arrange: Create initial data
      const repo: NewRepository = {
        id: "repo-1",
        connectionId: "conn-1",
        githubRepoId: 1,
        owner: "owner",
        name: "repo1",
        fullName: "owner/repo1",
        htmlUrl: "https://github.com/owner/repo1",
        description: null,
        defaultBranch: "main",
        isPrivate: false,
        syncEnabled: true,
        syncStatus: "pending",
        syncError: null,
        lastSyncAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.insert(schema.repositories).values(repo);

      // Act: First call - should fetch from DB
      const firstResult = await service.getDashboardData();
      expect(firstResult.repositories.pending).toBe(1);

      // Modify database
      const newRepo: NewRepository = {
        id: "repo-2",
        connectionId: "conn-1",
        githubRepoId: 2,
        owner: "owner",
        name: "repo2",
        fullName: "owner/repo2",
        htmlUrl: "https://github.com/owner/repo2",
        description: null,
        defaultBranch: "main",
        isPrivate: false,
        syncEnabled: true,
        syncStatus: "pending",
        syncError: null,
        lastSyncAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.insert(schema.repositories).values(newRepo);

      // Second call immediately - should return cached data
      const secondResult = await service.getDashboardData();

      // Assert: Should still show old cached data (1 pending repo, not 2)
      expect(secondResult.repositories.pending).toBe(1);
    });

    it("should fetch fresh data after 5s TTL expires", async () => {
      // Arrange: Create initial data
      const repo: NewRepository = {
        id: "repo-1",
        connectionId: "conn-1",
        githubRepoId: 1,
        owner: "owner",
        name: "repo1",
        fullName: "owner/repo1",
        htmlUrl: "https://github.com/owner/repo1",
        description: null,
        defaultBranch: "main",
        isPrivate: false,
        syncEnabled: true,
        syncStatus: "pending",
        syncError: null,
        lastSyncAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.insert(schema.repositories).values(repo);

      // Act: First call - should fetch from DB
      const firstResult = await service.getDashboardData();
      expect(firstResult.repositories.pending).toBe(1);

      // Mock time passing (advance time by 6 seconds)
      vi.useFakeTimers();
      vi.advanceTimersByTime(6000);

      // Modify database
      const newRepo: NewRepository = {
        id: "repo-2",
        connectionId: "conn-1",
        githubRepoId: 2,
        owner: "owner",
        name: "repo2",
        fullName: "owner/repo2",
        htmlUrl: "https://github.com/owner/repo2",
        description: null,
        defaultBranch: "main",
        isPrivate: false,
        syncEnabled: true,
        syncStatus: "pending",
        syncError: null,
        lastSyncAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.insert(schema.repositories).values(newRepo);

      // Second call after TTL - should fetch fresh data
      const secondResult = await service.getDashboardData();

      // Assert: Should show fresh data (2 pending repos)
      expect(secondResult.repositories.pending).toBe(2);

      // Cleanup
      vi.useRealTimers();
    });

    it("should refresh cache on subsequent calls after TTL expires", async () => {
      // Arrange: Create initial data
      const repo1: NewRepository = {
        id: "repo-1",
        connectionId: "conn-1",
        githubRepoId: 1,
        owner: "owner",
        name: "repo1",
        fullName: "owner/repo1",
        htmlUrl: "https://github.com/owner/repo1",
        description: null,
        defaultBranch: "main",
        isPrivate: false,
        syncEnabled: true,
        syncStatus: "pending",
        syncError: null,
        lastSyncAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.insert(schema.repositories).values(repo1);

      // First call
      const firstResult = await service.getDashboardData();
      expect(firstResult.repositories.pending).toBe(1);

      // Advance time by 6 seconds
      vi.useFakeTimers();
      vi.advanceTimersByTime(6000);

      // Add second repo
      const repo2: NewRepository = {
        id: "repo-2",
        connectionId: "conn-1",
        githubRepoId: 2,
        owner: "owner",
        name: "repo2",
        fullName: "owner/repo2",
        htmlUrl: "https://github.com/owner/repo2",
        description: null,
        defaultBranch: "main",
        isPrivate: false,
        syncEnabled: true,
        syncStatus: "synced",
        syncError: null,
        lastSyncAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await db.insert(schema.repositories).values(repo2);

      // Second call after TTL expires
      const secondResult = await service.getDashboardData();
      expect(secondResult.repositories.pending).toBe(1);
      expect(secondResult.repositories.synced).toBe(1);

      // Third call immediately (should use new cache)
      const thirdResult = await service.getDashboardData();
      expect(thirdResult.repositories.pending).toBe(1);
      expect(thirdResult.repositories.synced).toBe(1);

      // Cleanup
      vi.useRealTimers();
    });
  });
});
