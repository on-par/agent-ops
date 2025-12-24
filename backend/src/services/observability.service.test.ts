import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import { ObservabilityService } from "./observability.service.js";
import type {
  NewTrace,
  NewWorker,
  NewTemplate,
  NewWorkItem,
  TraceEventType,
} from "../db/schema.js";

describe("ObservabilityService", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: ObservabilityService;

  // Test data IDs
  let testWorkerId: string;
  let testWorkItemId: string;

  beforeEach(async () => {
    // Create in-memory database for testing
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    db = drizzle(sqlite, { schema });

    // Create tables
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS github_connections (
        id TEXT PRIMARY KEY,
        github_user_id INTEGER NOT NULL UNIQUE,
        github_username TEXT NOT NULL,
        github_avatar_url TEXT,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        token_expires_at INTEGER,
        scopes TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS repositories (
        id TEXT PRIMARY KEY,
        connection_id TEXT NOT NULL REFERENCES github_connections(id) ON DELETE CASCADE,
        github_repo_id INTEGER NOT NULL,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        full_name TEXT NOT NULL,
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

      CREATE TABLE IF NOT EXISTS work_items (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'backlog',
        repository_id TEXT,
        github_issue_id INTEGER,
        github_issue_number INTEGER,
        github_issue_url TEXT,
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
        FOREIGN KEY (template_id) REFERENCES templates(id),
        FOREIGN KEY (current_work_item_id) REFERENCES work_items(id)
      );

      CREATE TABLE IF NOT EXISTS traces (
        id TEXT PRIMARY KEY,
        worker_id TEXT,
        work_item_id TEXT,
        event_type TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (worker_id) REFERENCES workers(id),
        FOREIGN KEY (work_item_id) REFERENCES work_items(id)
      );
    `);

    service = new ObservabilityService(db);

    // Create test template
    const templateId = crypto.randomUUID();
    const now = new Date();
    const testTemplate: NewTemplate = {
      id: templateId,
      name: "Test Template",
      description: "A test template",
      createdBy: "system",
      systemPrompt: "You are a test agent",
      permissionMode: "askUser",
      maxTurns: 100,
      builtinTools: [],
      mcpServers: [],
      allowedWorkItemTypes: ["*"],
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(schema.templates).values(testTemplate);

    // Create test work item
    testWorkItemId = crypto.randomUUID();
    const testWorkItem: NewWorkItem = {
      id: testWorkItemId,
      title: "Test Work Item",
      type: "task",
      status: "ready",
      description: "A test work item",
      successCriteria: [],
      linkedFiles: [],
      createdBy: "test-user",
      assignedAgents: {},
      requiresApproval: {},
      createdAt: now,
      updatedAt: now,
      childIds: [],
      blockedBy: [],
    };
    await db.insert(schema.workItems).values(testWorkItem);

    // Create test worker
    testWorkerId = crypto.randomUUID();
    const testWorker: NewWorker = {
      id: testWorkerId,
      templateId,
      status: "idle",
      sessionId: crypto.randomUUID(),
      spawnedAt: now,
      tokensUsed: 1000,
      costUsd: 0.05,
      toolCalls: 5,
      errors: 0,
    };
    await db.insert(schema.workers).values(testWorker);
  });

  afterEach(() => {
    sqlite.close();
  });

  // ==================== TRACE RECORDING TESTS ====================

  describe("recordTrace", () => {
    it("should record a trace event", async () => {
      const trace = await service.recordTrace({
        workerId: testWorkerId,
        workItemId: testWorkItemId,
        eventType: "agent_state",
        data: { status: "working" },
      });

      expect(trace.id).toBeDefined();
      expect(trace.workerId).toBe(testWorkerId);
      expect(trace.workItemId).toBe(testWorkItemId);
      expect(trace.eventType).toBe("agent_state");
      expect(trace.data).toEqual({ status: "working" });
      expect(trace.timestamp).toBeInstanceOf(Date);
    });

    it("should generate unique IDs for traces", async () => {
      const trace1 = await service.recordTrace({
        workerId: testWorkerId,
        workItemId: null,
        eventType: "tool_call",
        data: { toolName: "read_file" },
      });

      const trace2 = await service.recordTrace({
        workerId: testWorkerId,
        workItemId: null,
        eventType: "tool_call",
        data: { toolName: "write_file" },
      });

      expect(trace1.id).not.toBe(trace2.id);
    });

    it("should handle null worker and work item IDs", async () => {
      const trace = await service.recordTrace({
        workerId: null,
        workItemId: null,
        eventType: "metric_update",
        data: { systemMetric: "test" },
      });

      expect(trace.workerId).toBeNull();
      expect(trace.workItemId).toBeNull();
    });
  });

  describe("recordAgentState", () => {
    it("should record agent state change", async () => {
      const trace = await service.recordAgentState(testWorkerId, {
        status: "working",
        currentRole: "implementer",
        contextWindowUsed: 50000,
      });

      expect(trace.eventType).toBe("agent_state");
      expect(trace.workerId).toBe(testWorkerId);
      expect(trace.data).toEqual({
        status: "working",
        currentRole: "implementer",
        contextWindowUsed: 50000,
      });
    });

    it("should handle minimal state data", async () => {
      const trace = await service.recordAgentState(testWorkerId, {
        status: "idle",
      });

      expect(trace.eventType).toBe("agent_state");
      expect(trace.data).toHaveProperty("status", "idle");
    });
  });

  describe("recordWorkItemUpdate", () => {
    it("should record work item update", async () => {
      const trace = await service.recordWorkItemUpdate(testWorkItemId, {
        status: "in_progress",
        assignedAgent: testWorkerId,
      });

      expect(trace.eventType).toBe("work_item_update");
      expect(trace.workItemId).toBe(testWorkItemId);
      expect(trace.workerId).toBeNull();
      expect(trace.data).toEqual({
        status: "in_progress",
        assignedAgent: testWorkerId,
      });
    });
  });

  describe("recordToolCall", () => {
    it("should record successful tool call", async () => {
      const trace = await service.recordToolCall(
        testWorkerId,
        testWorkItemId,
        {
          toolName: "read_file",
          input: { path: "/test/file.ts" },
          output: "file contents",
          duration: 150,
          success: true,
        }
      );

      expect(trace.eventType).toBe("tool_call");
      expect(trace.workerId).toBe(testWorkerId);
      expect(trace.workItemId).toBe(testWorkItemId);
      expect(trace.data).toMatchObject({
        toolName: "read_file",
        success: true,
      });
    });

    it("should record failed tool call", async () => {
      const trace = await service.recordToolCall(
        testWorkerId,
        testWorkItemId,
        {
          toolName: "write_file",
          success: false,
          errorMessage: "Permission denied",
        }
      );

      expect(trace.eventType).toBe("tool_call");
      const data = trace.data as { success: boolean; errorMessage: string };
      expect(data.success).toBe(false);
      expect(data.errorMessage).toBe("Permission denied");
    });

    it("should handle tool call without work item", async () => {
      const trace = await service.recordToolCall(testWorkerId, null, {
        toolName: "list_files",
        success: true,
      });

      expect(trace.workItemId).toBeNull();
    });
  });

  describe("recordError", () => {
    it("should record error with full details", async () => {
      const trace = await service.recordError(testWorkerId, testWorkItemId, {
        errorType: "RuntimeError",
        errorMessage: "Something went wrong",
        stackTrace: "Error: Something went wrong\n  at test.ts:10",
        context: { state: "working" },
      });

      expect(trace.eventType).toBe("error");
      expect(trace.workerId).toBe(testWorkerId);
      expect(trace.data).toMatchObject({
        errorType: "RuntimeError",
        errorMessage: "Something went wrong",
      });
    });

    it("should record error without work item", async () => {
      const trace = await service.recordError(testWorkerId, null, {
        errorType: "ConfigError",
        errorMessage: "Invalid configuration",
      });

      expect(trace.workItemId).toBeNull();
    });
  });

  describe("recordApprovalRequired", () => {
    it("should record approval request", async () => {
      const trace = await service.recordApprovalRequired(
        testWorkerId,
        testWorkItemId,
        {
          action: "delete_file",
          reason: "Deleting critical file requires approval",
          metadata: { filePath: "/important/file.ts" },
        }
      );

      expect(trace.eventType).toBe("approval_required");
      expect(trace.workerId).toBe(testWorkerId);
      expect(trace.workItemId).toBe(testWorkItemId);
      expect(trace.data).toMatchObject({
        action: "delete_file",
        reason: "Deleting critical file requires approval",
      });
    });
  });

  describe("recordMetricUpdate", () => {
    it("should record metric update", async () => {
      const trace = await service.recordMetricUpdate(testWorkerId, {
        tokensUsed: 1500,
        costUsd: 0.075,
      });

      expect(trace.eventType).toBe("metric_update");
      expect(trace.workerId).toBe(testWorkerId);
      expect(trace.workItemId).toBeNull();
    });
  });

  describe("startAgentSpan", () => {
    it("should create a custom OpenTelemetry span", () => {
      const span = service.startAgentSpan("custom-operation", testWorkerId);

      expect(span).toBeDefined();
      expect(typeof span.end).toBe("function");
      expect(typeof span.setAttribute).toBe("function");

      // Clean up by ending the span
      span.end();
    });

    it("should allow setting additional attributes on the span", () => {
      const span = service.startAgentSpan("test-operation", testWorkerId);

      // Should be able to set additional attributes
      expect(() => {
        span.setAttribute("custom.attribute", "test-value");
        span.setAttribute("custom.number", 42);
      }).not.toThrow();

      span.end();
    });
  });

  // ==================== TRACE QUERY TESTS ====================

  describe("getTraces", () => {
    beforeEach(async () => {
      // Create multiple traces
      await service.recordAgentState(testWorkerId, { status: "working" });
      await service.recordToolCall(testWorkerId, testWorkItemId, {
        toolName: "read",
        success: true,
      });
      await service.recordError(testWorkerId, testWorkItemId, {
        errorType: "Error",
        errorMessage: "Test error",
      });
      await service.recordWorkItemUpdate(testWorkItemId, {
        status: "in_progress",
      });
    });

    it("should retrieve all traces", async () => {
      const traces = await service.getTraces();
      expect(traces.length).toBeGreaterThanOrEqual(4);
    });

    it("should filter by worker ID", async () => {
      const traces = await service.getTraces({ workerId: testWorkerId });
      expect(traces.every((t) => t.workerId === testWorkerId)).toBe(true);
    });

    it("should filter by work item ID", async () => {
      const traces = await service.getTraces({ workItemId: testWorkItemId });
      expect(traces.every((t) => t.workItemId === testWorkItemId)).toBe(true);
    });

    it("should filter by event type", async () => {
      const traces = await service.getTraces({ eventType: "tool_call" });
      expect(traces.every((t) => t.eventType === "tool_call")).toBe(true);
      expect(traces.length).toBeGreaterThan(0);
    });

    it("should respect limit parameter", async () => {
      const traces = await service.getTraces({ limit: 2 });
      expect(traces.length).toBeLessThanOrEqual(2);
    });

    it("should respect offset parameter", async () => {
      const allTraces = await service.getTraces({ limit: 100 });
      const offsetTraces = await service.getTraces({ offset: 1, limit: 100 });

      expect(offsetTraces.length).toBe(allTraces.length - 1);
    });

    it("should filter by time range", async () => {
      const startTime = new Date(Date.now() - 1000);
      const endTime = new Date(Date.now() + 1000);

      const traces = await service.getTraces({ startTime, endTime });
      expect(traces.length).toBeGreaterThan(0);
    });

    it("should combine multiple filters", async () => {
      const traces = await service.getTraces({
        workerId: testWorkerId,
        eventType: "tool_call",
        limit: 10,
      });

      expect(
        traces.every(
          (t) => t.workerId === testWorkerId && t.eventType === "tool_call"
        )
      ).toBe(true);
    });

    it("should return traces in descending order by timestamp", async () => {
      const traces = await service.getTraces({ limit: 10 });

      for (let i = 0; i < traces.length - 1; i++) {
        const current = traces[i];
        const next = traces[i + 1];
        if (current && next) {
          expect(current.timestamp.getTime()).toBeGreaterThanOrEqual(
            next.timestamp.getTime()
          );
        }
      }
    });
  });

  describe("getTracesForWorker", () => {
    it("should retrieve traces for specific worker", async () => {
      await service.recordAgentState(testWorkerId, { status: "working" });
      await service.recordToolCall(testWorkerId, null, {
        toolName: "test",
        success: true,
      });

      const traces = await service.getTracesForWorker(testWorkerId);
      expect(traces.every((t) => t.workerId === testWorkerId)).toBe(true);
      expect(traces.length).toBeGreaterThan(0);
    });

    it("should respect limit parameter", async () => {
      await service.recordAgentState(testWorkerId, { status: "working" });
      await service.recordAgentState(testWorkerId, { status: "idle" });

      const traces = await service.getTracesForWorker(testWorkerId, 1);
      expect(traces.length).toBe(1);
    });
  });

  describe("getTracesForWorkItem", () => {
    it("should retrieve traces for specific work item", async () => {
      await service.recordWorkItemUpdate(testWorkItemId, {
        status: "in_progress",
      });
      await service.recordToolCall(testWorkerId, testWorkItemId, {
        toolName: "test",
        success: true,
      });

      const traces = await service.getTracesForWorkItem(testWorkItemId);
      expect(traces.every((t) => t.workItemId === testWorkItemId)).toBe(true);
      expect(traces.length).toBeGreaterThan(0);
    });

    it("should respect limit parameter", async () => {
      await service.recordWorkItemUpdate(testWorkItemId, {
        status: "in_progress",
      });
      await service.recordWorkItemUpdate(testWorkItemId, { status: "done" });

      const traces = await service.getTracesForWorkItem(testWorkItemId, 1);
      expect(traces.length).toBe(1);
    });
  });

  describe("getRecentErrors", () => {
    it("should retrieve only error traces", async () => {
      await service.recordError(testWorkerId, testWorkItemId, {
        errorType: "Error1",
        errorMessage: "First error",
      });
      await service.recordAgentState(testWorkerId, { status: "working" });
      await service.recordError(testWorkerId, null, {
        errorType: "Error2",
        errorMessage: "Second error",
      });

      const errors = await service.getRecentErrors();
      expect(errors.every((e) => e.eventType === "error")).toBe(true);
      expect(errors.length).toBe(2);
    });

    it("should respect limit parameter", async () => {
      await service.recordError(testWorkerId, null, {
        errorType: "Error1",
        errorMessage: "First",
      });
      await service.recordError(testWorkerId, null, {
        errorType: "Error2",
        errorMessage: "Second",
      });
      await service.recordError(testWorkerId, null, {
        errorType: "Error3",
        errorMessage: "Third",
      });

      const errors = await service.getRecentErrors(2);
      expect(errors.length).toBe(2);
    });
  });

  // ==================== METRICS AGGREGATION TESTS ====================

  describe("getWorkerMetrics", () => {
    it("should retrieve worker metrics", async () => {
      // Record some traces
      await service.recordAgentState(testWorkerId, { status: "working" });
      await service.recordToolCall(testWorkerId, null, {
        toolName: "test",
        success: true,
      });

      const metrics = await service.getWorkerMetrics(testWorkerId);

      expect(metrics.workerId).toBe(testWorkerId);
      expect(metrics.tokensUsed).toBe(1000);
      expect(metrics.costUsd).toBe(0.05);
      expect(metrics.toolCalls).toBe(5);
      expect(metrics.errors).toBe(0);
      expect(metrics.totalTraces).toBeGreaterThan(0);
      expect(metrics.lastActivity).toBeInstanceOf(Date);
    });

    it("should throw error for non-existent worker", async () => {
      await expect(
        service.getWorkerMetrics("non-existent-id")
      ).rejects.toThrow("Worker with ID non-existent-id not found");
    });

    it("should handle worker with no traces", async () => {
      const metrics = await service.getWorkerMetrics(testWorkerId);
      expect(metrics.totalTraces).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getSystemMetrics", () => {
    it("should retrieve system-wide metrics", async () => {
      // Record some traces
      await service.recordAgentState(testWorkerId, { status: "working" });
      await service.recordToolCall(testWorkerId, null, {
        toolName: "test",
        success: true,
      });

      const metrics = await service.getSystemMetrics();

      expect(metrics.totalWorkers).toBeGreaterThan(0);
      expect(metrics.activeWorkers).toBeGreaterThanOrEqual(0);
      expect(metrics.totalTokensUsed).toBeGreaterThanOrEqual(1000);
      expect(metrics.totalCostUsd).toBeGreaterThanOrEqual(0.05);
      expect(metrics.totalToolCalls).toBeGreaterThanOrEqual(5);
      expect(metrics.totalErrors).toBe(0);
      expect(metrics.tracesLast24h).toBeGreaterThan(0);
    });

    it("should count active workers correctly", async () => {
      const metrics = await service.getSystemMetrics();
      expect(metrics.activeWorkers).toBeGreaterThanOrEqual(0);
      expect(metrics.activeWorkers).toBeLessThanOrEqual(metrics.totalWorkers);
    });

    it("should handle system with no workers", async () => {
      // Delete the test worker
      await db.delete(schema.workers);

      const metrics = await service.getSystemMetrics();

      expect(metrics.totalWorkers).toBe(0);
      expect(metrics.activeWorkers).toBe(0);
      expect(metrics.totalTokensUsed).toBe(0);
      expect(metrics.totalCostUsd).toBe(0);
    });

    it("should count traces from last 24 hours", async () => {
      await service.recordAgentState(testWorkerId, { status: "working" });

      const metrics = await service.getSystemMetrics();
      expect(metrics.tracesLast24h).toBeGreaterThan(0);
    });
  });

  describe("getCostSummary", () => {
    beforeEach(async () => {
      // Record metric updates with cost data
      await service.recordMetricUpdate(testWorkerId, {
        tokensUsed: 1000,
        costUsd: 0.05,
      });
      await service.recordMetricUpdate(testWorkerId, {
        tokensUsed: 2000,
        costUsd: 0.1,
      });
      await service.recordToolCall(testWorkerId, null, {
        toolName: "test",
        success: true,
      });
    });

    it("should return cost summary by day", async () => {
      const summary = await service.getCostSummary({ groupBy: "day" });

      expect(Array.isArray(summary)).toBe(true);
      expect(summary.length).toBeGreaterThan(0);

      const entry = summary[0];
      if (entry) {
        expect(entry.period).toBeDefined();
        expect(entry.totalCost).toBeGreaterThanOrEqual(0);
        expect(entry.tokenCount).toBeGreaterThanOrEqual(0);
        expect(entry.toolCalls).toBeGreaterThanOrEqual(0);
      }
    });

    it("should return cost summary by hour", async () => {
      const summary = await service.getCostSummary({ groupBy: "hour" });
      expect(Array.isArray(summary)).toBe(true);
    });

    it("should return cost summary by week", async () => {
      const summary = await service.getCostSummary({ groupBy: "week" });
      expect(Array.isArray(summary)).toBe(true);
    });

    it("should filter by time range", async () => {
      const startTime = new Date(Date.now() - 1000);
      const endTime = new Date(Date.now() + 1000);

      const summary = await service.getCostSummary({ startTime, endTime });
      expect(Array.isArray(summary)).toBe(true);
    });

    it("should include tool call counts", async () => {
      const summary = await service.getCostSummary();

      if (summary.length > 0) {
        const entry = summary[0];
        if (entry) {
          expect(entry.toolCalls).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe("getToolCallStats", () => {
    beforeEach(async () => {
      // Record multiple tool calls
      await service.recordToolCall(testWorkerId, null, {
        toolName: "read_file",
        success: true,
      });
      await service.recordToolCall(testWorkerId, null, {
        toolName: "write_file",
        success: true,
      });
      await service.recordToolCall(testWorkerId, null, {
        toolName: "read_file",
        success: true,
      });
    });

    it("should return tool call statistics", async () => {
      const stats = await service.getToolCallStats();

      expect(stats.totalCalls).toBe(3);
      expect(stats.byTool).toHaveProperty("read_file", 2);
      expect(stats.byTool).toHaveProperty("write_file", 1);
      expect(stats.workersWithToolCalls).toBe(1);
      expect(stats.averageCallsPerWorker).toBe(3);
    });

    it("should filter by worker ID", async () => {
      // Create another worker
      const secondWorkerId = crypto.randomUUID();
      const now = new Date();
      await db.insert(schema.workers).values({
        id: secondWorkerId,
        templateId: (
          await db
            .select({ id: schema.templates.id })
            .from(schema.templates)
            .limit(1)
        )[0]!.id,
        status: "idle",
        sessionId: crypto.randomUUID(),
        spawnedAt: now,
      });

      await service.recordToolCall(secondWorkerId, null, {
        toolName: "bash",
        success: true,
      });

      const statsForWorker = await service.getToolCallStats(testWorkerId);
      expect(statsForWorker.totalCalls).toBe(3);
      expect(statsForWorker.workersWithToolCalls).toBe(1);
    });

    it("should handle no tool calls", async () => {
      // Delete all traces
      await db.delete(schema.traces);

      const stats = await service.getToolCallStats();

      expect(stats.totalCalls).toBe(0);
      expect(stats.byTool).toEqual({});
      expect(stats.workersWithToolCalls).toBe(0);
      expect(stats.averageCallsPerWorker).toBe(0);
    });

    it("should calculate average calls per worker correctly", async () => {
      const stats = await service.getToolCallStats();

      if (stats.workersWithToolCalls > 0) {
        expect(stats.averageCallsPerWorker).toBe(
          stats.totalCalls / stats.workersWithToolCalls
        );
      } else {
        expect(stats.averageCallsPerWorker).toBe(0);
      }
    });
  });

  describe("getTraceStatsByEventType", () => {
    beforeEach(async () => {
      // Create traces of different types
      await service.recordAgentState(testWorkerId, { status: "working" });
      await service.recordAgentState(testWorkerId, { status: "idle" });
      await service.recordToolCall(testWorkerId, null, {
        toolName: "test",
        success: true,
      });
      await service.recordError(testWorkerId, null, {
        errorType: "Error",
        errorMessage: "Test",
      });
      await service.recordWorkItemUpdate(testWorkItemId, {
        status: "in_progress",
      });
    });

    it("should return counts by event type", async () => {
      const stats = await service.getTraceStatsByEventType();

      expect(stats).toHaveProperty("agent_state");
      expect(stats).toHaveProperty("tool_call");
      expect(stats).toHaveProperty("error");
      expect(stats).toHaveProperty("work_item_update");
      expect(stats).toHaveProperty("metric_update");
      expect(stats).toHaveProperty("approval_required");

      expect(stats.agent_state).toBeGreaterThanOrEqual(2);
      expect(stats.tool_call).toBeGreaterThanOrEqual(1);
      expect(stats.error).toBeGreaterThanOrEqual(1);
      expect(stats.work_item_update).toBeGreaterThanOrEqual(1);
    });

    it("should filter by worker ID", async () => {
      const stats = await service.getTraceStatsByEventType({
        workerId: testWorkerId,
      });

      expect(stats.agent_state).toBeGreaterThanOrEqual(2);
      expect(stats.tool_call).toBeGreaterThanOrEqual(1);
    });

    it("should filter by time range", async () => {
      const startTime = new Date(Date.now() - 1000);
      const endTime = new Date(Date.now() + 1000);

      const stats = await service.getTraceStatsByEventType({
        startTime,
        endTime,
      });

      const total = Object.values(stats).reduce((sum, count) => sum + count, 0);
      expect(total).toBeGreaterThan(0);
    });

    it("should initialize all event types with 0", async () => {
      // Delete all traces
      await db.delete(schema.traces);

      const stats = await service.getTraceStatsByEventType();

      expect(stats.agent_state).toBe(0);
      expect(stats.tool_call).toBe(0);
      expect(stats.error).toBe(0);
      expect(stats.work_item_update).toBe(0);
      expect(stats.metric_update).toBe(0);
      expect(stats.approval_required).toBe(0);
    });
  });

  // ==================== INTEGRATION TESTS ====================

  describe("Integration scenarios", () => {
    it("should track complete agent workflow", async () => {
      // Agent state changes
      await service.recordAgentState(testWorkerId, {
        status: "idle",
      });
      await service.recordAgentState(testWorkerId, {
        status: "working",
        currentRole: "implementer",
      });

      // Work item assignment
      await service.recordWorkItemUpdate(testWorkItemId, {
        status: "in_progress",
        assignedAgent: testWorkerId,
      });

      // Tool calls
      await service.recordToolCall(testWorkerId, testWorkItemId, {
        toolName: "read_file",
        success: true,
        duration: 100,
      });
      await service.recordToolCall(testWorkerId, testWorkItemId, {
        toolName: "write_file",
        success: true,
        duration: 200,
      });

      // Metric updates
      await service.recordMetricUpdate(testWorkerId, {
        tokensUsed: 500,
        costUsd: 0.025,
      });

      // Complete work
      await service.recordWorkItemUpdate(testWorkItemId, {
        status: "done",
      });
      await service.recordAgentState(testWorkerId, {
        status: "idle",
      });

      // Verify traces
      const traces = await service.getTracesForWorker(testWorkerId);
      expect(traces.length).toBeGreaterThanOrEqual(6);

      // Verify metrics
      const metrics = await service.getWorkerMetrics(testWorkerId);
      expect(metrics.totalTraces).toBeGreaterThanOrEqual(6);
    });

    it("should track error recovery workflow", async () => {
      // Agent encounters error
      await service.recordError(testWorkerId, testWorkItemId, {
        errorType: "RuntimeError",
        errorMessage: "File not found",
        stackTrace: "Error: File not found\n  at test.ts:10",
      });

      // Approval required
      await service.recordApprovalRequired(testWorkerId, testWorkItemId, {
        action: "retry_operation",
        reason: "Need approval to retry after error",
      });

      // Agent state changes
      await service.recordAgentState(testWorkerId, {
        status: "paused",
      });
      await service.recordAgentState(testWorkerId, {
        status: "working",
      });

      // Verify error tracking
      const errors = await service.getRecentErrors();
      expect(errors.length).toBeGreaterThan(0);

      const errorTrace = errors.find(
        (e) =>
          e.workerId === testWorkerId && e.workItemId === testWorkItemId
      );
      expect(errorTrace).toBeDefined();
      expect(errorTrace?.eventType).toBe("error");
    });

    it("should aggregate metrics across multiple workers", async () => {
      // Create second worker
      const secondWorkerId = crypto.randomUUID();
      const now = new Date();
      await db.insert(schema.workers).values({
        id: secondWorkerId,
        templateId: (
          await db
            .select({ id: schema.templates.id })
            .from(schema.templates)
            .limit(1)
        )[0]!.id,
        status: "idle",
        sessionId: crypto.randomUUID(),
        spawnedAt: now,
        tokensUsed: 2000,
        costUsd: 0.1,
        toolCalls: 10,
      });

      // Record traces for both workers
      await service.recordToolCall(testWorkerId, null, {
        toolName: "test1",
        success: true,
      });
      await service.recordToolCall(secondWorkerId, null, {
        toolName: "test2",
        success: true,
      });

      // Get system metrics
      const metrics = await service.getSystemMetrics();

      expect(metrics.totalWorkers).toBe(2);
      expect(metrics.totalTokensUsed).toBeGreaterThanOrEqual(3000);
      expect(metrics.totalCostUsd).toBeGreaterThanOrEqual(0.15);
      expect(metrics.totalToolCalls).toBeGreaterThanOrEqual(15);
    });
  });
});
