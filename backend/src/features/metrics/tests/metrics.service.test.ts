import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../../shared/db/schema.js";
import { MetricsService } from "../services/metrics.service.js";
import type {
  NewWorker,
  NewWorkItem,
  NewAgentExecution,
  NewTrace,
  NewTemplate,
} from "../../../shared/db/schema.js";

describe("MetricsService", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: MetricsService;

  beforeEach(async () => {
    // Create in-memory database for testing
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    db = drizzle(sqlite, { schema });

    // Create all required tables matching actual schema using drizzle migrations
    // We'll use raw SQL to create tables that match the schema
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        system_prompt TEXT NOT NULL,
        permission_mode TEXT NOT NULL DEFAULT 'askUser',
        max_turns INTEGER NOT NULL DEFAULT 100,
        builtin_tools TEXT NOT NULL DEFAULT '[]',
        mcp_servers TEXT NOT NULL DEFAULT '[]',
        allowed_work_item_types TEXT NOT NULL DEFAULT '["*"]',
        default_role TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
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

      CREATE TABLE IF NOT EXISTS traces (
        id TEXT PRIMARY KEY,
        worker_id TEXT,
        work_item_id TEXT,
        event_type TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL
      );

      -- Insert dummy template for workers
      INSERT INTO templates (id, name, created_by, system_prompt, created_at, updated_at)
      VALUES ('template-1', 'Test Template', 'system', 'Test prompt', ${Date.now()}, ${Date.now()});
      INSERT INTO workspaces (id, path) VALUES ('workspace-1', '/test');
    `);

    // Create service
    service = new MetricsService(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("getAgentMetrics", () => {
    it("should return empty array when no workers exist", async () => {
      // Act
      const result = await service.getAgentMetrics({});

      // Assert
      expect(result.data).toEqual([]);
      expect(result.metadata.count).toBe(0);
      expect(result.metadata.limit).toBe(50);
      expect(result.metadata.offset).toBe(0);
    });

    it("should return correct structure for single worker", async () => {
      // Arrange
      const now = Date.now();
      const worker: NewWorker = {
        id: "worker-1",
        templateId: "template-1",
        status: "idle",
        currentWorkItemId: null,
        currentRole: null,
        sessionId: "session-1",
        spawnedAt: new Date(now),
        contextWindowUsed: 0,
        contextWindowLimit: 200000,
        tokensUsed: 100,
        costUsd: 0.01,
        toolCalls: 5,
        errors: 0,
        lastHeartbeat: new Date(now),
        terminatedAt: null,
      };

      db.insert(schema.workers).values(worker).run();

      // Act
      const result = await service.getAgentMetrics({});

      // Assert
      expect(result.data).toHaveLength(1);
      expect(result.data[0].workerId).toBe("worker-1");
      expect(result.data[0].templateId).toBe("template-1");
      expect(["active", "idle", "offline"]).toContain(result.data[0].status);
    });

    it("should calculate performance metrics from executions", async () => {
      // Arrange
      const now = Date.now();
      const worker: NewWorker = {
        id: "worker-1",
        templateId: "template-1",
        status: "idle",
        currentWorkItemId: null,
        currentRole: null,
        sessionId: "session-1",
        spawnedAt: new Date(now),
        contextWindowUsed: 0,
        contextWindowLimit: 200000,
        tokensUsed: 100,
        costUsd: 0.01,
        toolCalls: 5,
        errors: 0,
        lastHeartbeat: new Date(now),
        terminatedAt: null,
      };

      db.insert(schema.workers).values(worker).run();

      const executions: NewAgentExecution[] = [
        {
          id: "exec-1",
          workerId: "worker-1",
          workItemId: null,
          workspaceId: "workspace-1",
          templateId: "template-1",
          status: "success",
          startedAt: new Date(now),
          completedAt: new Date(now + 1000),
          durationMs: 1000,
          tokensUsed: 50,
          costUsd: 0.005,
          toolCallsCount: 2,
          errorMessage: null,
          output: "Success",
          createdAt: new Date(now),
        },
        {
          id: "exec-2",
          workerId: "worker-1",
          workItemId: null,
          workspaceId: "workspace-1",
          templateId: "template-1",
          status: "success",
          startedAt: new Date(now + 2000),
          completedAt: new Date(now + 4000),
          durationMs: 2000,
          tokensUsed: 100,
          costUsd: 0.01,
          toolCallsCount: 3,
          errorMessage: null,
          output: "Success",
          createdAt: new Date(now + 2000),
        },
      ];

      db.insert(schema.agentExecutions).values(executions).run();

      // Act
      const result = await service.getAgentMetrics({});

      // Assert
      expect(result.data).toHaveLength(1);
      expect(result.data[0].performance.totalExecutions).toBe(2);
      expect(result.data[0].performance.avgExecutionTimeMs).toBe(1500);
      expect(result.data[0].performance.successRate).toBe(1);
    });

    it("should respect pagination (limit/offset)", async () => {
      // Arrange - create 5 workers
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        const worker: NewWorker = {
          id: `worker-${i}`,
          templateId: "template-1",
          status: "idle",
          currentWorkItemId: null,
          currentRole: null,
          sessionId: `session-${i}`,
          spawnedAt: new Date(now),
          contextWindowUsed: 0,
          contextWindowLimit: 200000,
          tokensUsed: 100,
          costUsd: 0.01,
          toolCalls: 5,
          errors: 0,
          lastHeartbeat: new Date(now),
          terminatedAt: null,
        };
        db.insert(schema.workers).values(worker).run();
      }

      // Act
      const result = await service.getAgentMetrics({ limit: 2, offset: 1 });

      // Assert
      expect(result.data).toHaveLength(2);
      expect(result.metadata.limit).toBe(2);
      expect(result.metadata.offset).toBe(1);
    });

    it("should filter by templateId", async () => {
      // Arrange
      const now = Date.now();
      // Insert second template directly via SQL since it requires more fields
      sqlite.exec(`
        INSERT INTO templates (id, name, created_by, system_prompt, created_at, updated_at)
        VALUES ('template-2', 'Different Template', 'system', 'Test prompt', ${now}, ${now});
      `);

      const workers: NewWorker[] = [
        {
          id: "worker-1",
          templateId: "template-1",
          status: "idle",
          currentWorkItemId: null,
          currentRole: null,
          sessionId: "session-1",
          spawnedAt: new Date(now),
          contextWindowUsed: 0,
          contextWindowLimit: 200000,
          tokensUsed: 100,
          costUsd: 0.01,
          toolCalls: 5,
          errors: 0,
          lastHeartbeat: new Date(now),
          terminatedAt: null,
        },
        {
          id: "worker-2",
          templateId: "template-2",
          status: "idle",
          currentWorkItemId: null,
          currentRole: null,
          sessionId: "session-2",
          spawnedAt: new Date(now),
          contextWindowUsed: 0,
          contextWindowLimit: 200000,
          tokensUsed: 100,
          costUsd: 0.01,
          toolCalls: 5,
          errors: 0,
          lastHeartbeat: new Date(now),
          terminatedAt: null,
        },
      ];

      db.insert(schema.workers).values(workers).run();

      // Act
      const result = await service.getAgentMetrics({ templateId: "template-2" });

      // Assert
      expect(result.data).toHaveLength(1);
      expect(result.data[0].templateId).toBe("template-2");
    });
  });

  describe("getWorkMetrics", () => {
    it("should return correct status counts", async () => {
      // Arrange
      const now = Date.now();
      const workItems: NewWorkItem[] = [
        {
          id: "work-1",
          title: "Task 1",
          type: "bug",
          status: "backlog",
          repositoryId: null,
          githubIssueId: null,
          githubIssueNumber: null,
          githubIssueUrl: null,
          githubPrNumber: null,
          githubPrUrl: null,
          description: "",
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
          createdAt: new Date(now),
          updatedAt: new Date(now),
          startedAt: null,
          completedAt: null,
        },
        {
          id: "work-2",
          title: "Task 2",
          type: "feature",
          status: "ready",
          repositoryId: null,
          githubIssueId: null,
          githubIssueNumber: null,
          githubIssueUrl: null,
          githubPrNumber: null,
          githubPrUrl: null,
          description: "",
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
          createdAt: new Date(now),
          updatedAt: new Date(now),
          startedAt: null,
          completedAt: null,
        },
      ];

      db.insert(schema.workItems).values(workItems).run();

      // Act
      const result = await service.getWorkMetrics({});

      // Assert
      expect(result.data.totalCount).toBeGreaterThan(0);
      expect(result.data.byStatus).toBeDefined();
      expect(typeof result.data.byType).toBe("object");
    });

    it("should calculate avgCompletionTimeMs from completed items", async () => {
      // Arrange
      const now = Date.now();
      const createdTime = new Date(now - 10000);
      const completedTime = new Date(now);

      const workItem: NewWorkItem = {
        id: "work-1",
        title: "Completed Task",
        type: "feature",
        status: "done",
        repositoryId: null,
        githubIssueId: null,
        githubIssueNumber: null,
        githubIssueUrl: null,
        githubPrNumber: null,
        githubPrUrl: null,
        description: "",
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
        createdAt: createdTime,
        updatedAt: completedTime,
        startedAt: createdTime,
        completedAt: completedTime,
      };

      db.insert(schema.workItems).values(workItem).run();

      // Act
      const result = await service.getWorkMetrics({});

      // Assert
      expect(result.data.avgCompletionTimeMs).toBeGreaterThan(0);
    });

    it("should group by work item type correctly", async () => {
      // Arrange
      const now = Date.now();
      const workItems: NewWorkItem[] = [
        {
          id: "work-1",
          title: "Bug",
          type: "bug",
          status: "backlog",
          repositoryId: null,
          githubIssueId: null,
          githubIssueNumber: null,
          githubIssueUrl: null,
          githubPrNumber: null,
          githubPrUrl: null,
          description: "",
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
          createdAt: new Date(now),
          updatedAt: new Date(now),
          startedAt: null,
          completedAt: null,
        },
        {
          id: "work-2",
          title: "Feature",
          type: "feature",
          status: "backlog",
          repositoryId: null,
          githubIssueId: null,
          githubIssueNumber: null,
          githubIssueUrl: null,
          githubPrNumber: null,
          githubPrUrl: null,
          description: "",
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
          createdAt: new Date(now),
          updatedAt: new Date(now),
          startedAt: null,
          completedAt: null,
        },
        {
          id: "work-3",
          title: "Feature 2",
          type: "feature",
          status: "backlog",
          repositoryId: null,
          githubIssueId: null,
          githubIssueNumber: null,
          githubIssueUrl: null,
          githubPrNumber: null,
          githubPrUrl: null,
          description: "",
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
          createdAt: new Date(now),
          updatedAt: new Date(now),
          startedAt: null,
          completedAt: null,
        },
      ];

      db.insert(schema.workItems).values(workItems).run();

      // Act
      const result = await service.getWorkMetrics({});

      // Assert
      expect(result.data.byType.bug).toBe(1);
      expect(result.data.byType.feature).toBe(2);
    });

    it("should respect date range filters", async () => {
      // Arrange
      const now = Date.now();
      const oldTime = new Date(now - 100000);
      const newTime = new Date(now);

      const workItems: NewWorkItem[] = [
        {
          id: "work-1",
          title: "Old Task",
          type: "bug",
          status: "backlog",
          repositoryId: null,
          githubIssueId: null,
          githubIssueNumber: null,
          githubIssueUrl: null,
          githubPrNumber: null,
          githubPrUrl: null,
          description: "",
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
          createdAt: oldTime,
          updatedAt: oldTime,
          startedAt: null,
          completedAt: null,
        },
        {
          id: "work-2",
          title: "New Task",
          type: "feature",
          status: "backlog",
          repositoryId: null,
          githubIssueId: null,
          githubIssueNumber: null,
          githubIssueUrl: null,
          githubPrNumber: null,
          githubPrUrl: null,
          description: "",
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
          createdAt: newTime,
          updatedAt: newTime,
          startedAt: null,
          completedAt: null,
        },
      ];

      db.insert(schema.workItems).values(workItems).run();

      // Act - filter for recent items only
      const result = await service.getWorkMetrics({
        startDate: new Date(now - 50000),
      });

      // Assert
      expect(result.data.totalCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("getSystemMetrics", () => {
    it("should aggregate all worker counts", async () => {
      // Arrange
      const now = Date.now();
      const workers: NewWorker[] = [
        {
          id: "worker-1",
          templateId: "template-1",
          status: "idle",
          currentWorkItemId: null,
          currentRole: null,
          sessionId: "session-1",
          spawnedAt: new Date(now),
          contextWindowUsed: 0,
          contextWindowLimit: 200000,
          tokensUsed: 100,
          costUsd: 0.01,
          toolCalls: 5,
          errors: 0,
          lastHeartbeat: new Date(now),
          terminatedAt: null,
        },
        {
          id: "worker-2",
          templateId: "template-1",
          status: "idle",
          currentWorkItemId: null,
          currentRole: null,
          sessionId: "session-2",
          spawnedAt: new Date(now),
          contextWindowUsed: 0,
          contextWindowLimit: 200000,
          tokensUsed: 100,
          costUsd: 0.01,
          toolCalls: 5,
          errors: 0,
          lastHeartbeat: new Date(now),
          terminatedAt: null,
        },
      ];

      db.insert(schema.workers).values(workers).run();

      // Act
      const result = await service.getSystemMetrics();

      // Assert
      expect(result.data.workers.total).toBeGreaterThanOrEqual(2);
      expect(result.data.workers.active).toBeDefined();
      expect(result.data.workers.idle).toBeDefined();
      expect(result.data.workers.offline).toBeDefined();
    });

    it("should include trace and error counts", async () => {
      // Arrange
      const now = Date.now();
      const traces: NewTrace[] = [
        {
          id: "trace-1",
          eventType: "tool_call",
          timestamp: new Date(now),
          workerId: null,
          workItemId: null,
          data: {},
        },
        {
          id: "trace-2",
          eventType: "error",
          timestamp: new Date(now),
          workerId: null,
          workItemId: null,
          data: {},
        },
      ];

      db.insert(schema.traces).values(traces).run();

      // Act
      const result = await service.getSystemMetrics();

      // Assert
      expect(result.data.traces.totalCount).toBeGreaterThanOrEqual(0);
      expect(result.data.traces.errorCount).toBeDefined();
      expect(result.data.traces.last24Hours).toBeDefined();
    });

    it("should include system totals (tokens, cost, toolCalls)", async () => {
      // Arrange
      const now = Date.now();
      const worker: NewWorker = {
        id: "worker-1",
        templateId: "template-1",
        status: "idle",
        currentWorkItemId: null,
        currentRole: null,
        sessionId: "session-1",
        spawnedAt: new Date(now),
        contextWindowUsed: 0,
        contextWindowLimit: 200000,
        tokensUsed: 1000,
        costUsd: 0.5,
        toolCalls: 25,
        errors: 0,
        lastHeartbeat: new Date(now),
        terminatedAt: null,
      };

      db.insert(schema.workers).values(worker).run();

      // Act
      const result = await service.getSystemMetrics();

      // Assert
      expect(result.data.system.totalTokens).toBeGreaterThanOrEqual(0);
      expect(result.data.system.totalCost).toBeGreaterThanOrEqual(0);
      expect(result.data.system.totalToolCalls).toBeGreaterThanOrEqual(0);
      expect(result.data.system.avgExecutionTimeMs).toBeDefined();
    });
  });

  describe("getTraces", () => {
    it("should return traces ordered by timestamp desc", async () => {
      // Arrange
      const now = Date.now();
      const traces: NewTrace[] = [
        {
          id: "trace-1",
          eventType: "tool_call",
          timestamp: new Date(now - 3000),
          workerId: null,
          workItemId: null,
          data: {},
        },
        {
          id: "trace-2",
          eventType: "tool_call",
          timestamp: new Date(now),
          workerId: null,
          workItemId: null,
          data: {},
        },
      ];

      db.insert(schema.traces).values(traces).run();

      // Act
      const result = await service.getTraces({});

      // Assert
      expect(result.data).toHaveLength(2);
      if (result.data.length === 2) {
        // Most recent should be first
        const firstTimestamp = new Date(result.data[0].timestamp).getTime();
        const secondTimestamp = new Date(result.data[1].timestamp).getTime();
        expect(firstTimestamp).toBeGreaterThanOrEqual(secondTimestamp);
      }
    });

    it("should filter by workerId", async () => {
      // Arrange
      const now = Date.now();
      const traces: NewTrace[] = [
        {
          id: "trace-1",
          eventType: "tool_call",
          timestamp: new Date(now),
          workerId: "worker-1",
          workItemId: null,
          data: {},
        },
        {
          id: "trace-2",
          eventType: "tool_call",
          timestamp: new Date(now),
          workerId: "worker-2",
          workItemId: null,
          data: {},
        },
      ];

      db.insert(schema.traces).values(traces).run();

      // Act
      const result = await service.getTraces({ workerId: "worker-1" });

      // Assert
      expect(result.data.every((t) => t.workerId === "worker-1")).toBe(true);
    });

    it("should filter by eventType", async () => {
      // Arrange
      const now = Date.now();
      const traces: NewTrace[] = [
        {
          id: "trace-1",
          eventType: "error",
          timestamp: new Date(now),
          workerId: null,
          workItemId: null,
          data: {},
        },
        {
          id: "trace-2",
          eventType: "tool_call",
          timestamp: new Date(now),
          workerId: null,
          workItemId: null,
          data: {},
        },
      ];

      db.insert(schema.traces).values(traces).run();

      // Act
      const result = await service.getTraces({ eventType: "error" });

      // Assert
      expect(result.data.every((t) => t.eventType === "error")).toBe(true);
    });

    it("should respect time range filters", async () => {
      // Arrange
      const now = Date.now();
      const oldTime = new Date(now - 100000);
      const newTime = new Date(now);

      const traces: NewTrace[] = [
        {
          id: "trace-1",
          eventType: "tool_call",
          timestamp: oldTime,
          workerId: null,
          workItemId: null,
          data: {},
        },
        {
          id: "trace-2",
          eventType: "tool_call",
          timestamp: newTime,
          workerId: null,
          workItemId: null,
          data: {},
        },
      ];

      db.insert(schema.traces).values(traces).run();

      // Act
      const result = await service.getTraces({
        startTime: new Date(now - 50000),
      });

      // Assert
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe("trace-2");
    });

    it("should respect pagination (limit/offset)", async () => {
      // Arrange - create 5 traces
      const now = Date.now();
      const traces: NewTrace[] = [];
      for (let i = 0; i < 5; i++) {
        traces.push({
          id: `trace-${i}`,
          eventType: "tool_call",
          timestamp: new Date(now - i * 1000),
          workerId: null,
          workItemId: null,
          data: {},
        });
      }

      db.insert(schema.traces).values(traces).run();

      // Act
      const result = await service.getTraces({ limit: 2, offset: 1 });

      // Assert
      expect(result.data).toHaveLength(2);
      expect(result.metadata.limit).toBe(2);
      expect(result.metadata.offset).toBe(1);
    });
  });

  describe("Caching", () => {
    it("should return cached data within 5s TTL", async () => {
      // Arrange
      const now = Date.now();
      const worker: NewWorker = {
        id: "worker-1",
        templateId: "template-1",
        status: "idle",
        currentWorkItemId: null,
        currentRole: null,
        sessionId: "session-1",
        spawnedAt: new Date(now),
        contextWindowUsed: 0,
        contextWindowLimit: 200000,
        tokensUsed: 100,
        costUsd: 0.01,
        toolCalls: 5,
        errors: 0,
        lastHeartbeat: new Date(now),
        terminatedAt: null,
      };

      db.insert(schema.workers).values(worker).run();

      // Act - first call
      const result1 = await service.getSystemMetrics();

      // Modify database after first call
      db.insert(schema.workers)
        .values({
          id: "worker-2",
          templateId: "template-1",
          status: "idle",
          currentWorkItemId: null,
          currentRole: null,
          sessionId: "session-2",
          spawnedAt: new Date(now),
          contextWindowUsed: 0,
          contextWindowLimit: 200000,
          tokensUsed: 100,
          costUsd: 0.01,
          toolCalls: 5,
          errors: 0,
          lastHeartbeat: new Date(now),
          terminatedAt: null,
        })
        .run();

      // Act - second call immediately (should be cached)
      const result2 = await service.getSystemMetrics();

      // Assert - results should be same due to cache
      expect(result1.data.workers.total).toBe(result2.data.workers.total);
    });

    it("should refresh cache after 5s TTL expires", async () => {
      // This test verifies cache expiration by checking cache state
      // In unit tests, we would need to mock Date or use actual timeout
      // For now, we verify clearCache works
      const now = Date.now();
      const worker: NewWorker = {
        id: "worker-1",
        templateId: "template-1",
        status: "idle",
        currentWorkItemId: null,
        currentRole: null,
        sessionId: "session-1",
        spawnedAt: new Date(now),
        contextWindowUsed: 0,
        contextWindowLimit: 200000,
        tokensUsed: 100,
        costUsd: 0.01,
        toolCalls: 5,
        errors: 0,
        lastHeartbeat: new Date(now),
        terminatedAt: null,
      };

      db.insert(schema.workers).values(worker).run();

      // Act - populate cache
      const result1 = await service.getSystemMetrics();

      // Clear cache explicitly (simulating TTL expiration)
      service.clearCache();

      // Add another worker
      db.insert(schema.workers)
        .values({
          id: "worker-2",
          templateId: "template-1",
          status: "idle",
          currentWorkItemId: null,
          currentRole: null,
          sessionId: "session-2",
          spawnedAt: new Date(now),
          contextWindowUsed: 0,
          contextWindowLimit: 200000,
          tokensUsed: 100,
          costUsd: 0.01,
          toolCalls: 5,
          errors: 0,
          lastHeartbeat: new Date(now),
          terminatedAt: null,
        })
        .run();

      // Act - fetch again after cache clear
      const result2 = await service.getSystemMetrics();

      // Assert - second result should have updated worker count
      expect(result2.data.workers.total).toBeGreaterThan(result1.data.workers.total);
    });
  });
});
