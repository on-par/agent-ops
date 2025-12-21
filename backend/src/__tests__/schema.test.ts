import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  workItemTypes,
  workItemStatuses,
  agentRoles,
  permissionModes,
  workerStatuses,
  traceEventTypes,
  type WorkItemType,
  type WorkItemStatus,
  type PermissionMode,
  type WorkerStatus,
  type TraceEventType,
  type SuccessCriterion,
  type MCPServerConfig,
} from "../db/schema.js";

// ========================================
// Validation Schemas
// ========================================

// Work Item Schemas
const successCriterionSchema = z.object({
  id: z.string().uuid(),
  description: z.string().min(1),
  completed: z.boolean(),
  verifiedBy: z.string().optional(),
  verifiedAt: z.number().optional(),
});

const createWorkItemSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(workItemTypes),
  description: z.string().default(""),
  successCriteria: z.array(successCriterionSchema).default([]),
  linkedFiles: z.array(z.string()).default([]),
  createdBy: z.string().min(1),
  parentId: z.string().uuid().optional(),
});

const updateWorkItemSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  status: z.enum(workItemStatuses).optional(),
  successCriteria: z.array(successCriterionSchema).optional(),
  linkedFiles: z.array(z.string()).optional(),
  assignedAgents: z.record(z.string(), z.string().optional()).optional(),
  requiresApproval: z.record(z.string(), z.boolean()).optional(),
});

// Template Schemas
const mcpServerSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["stdio", "sse", "inprocess"]),
  command: z.string().optional(),
  url: z.string().url().optional(),
  args: z.array(z.string()),
  env: z.record(z.string(), z.string()),
});

const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().default(""),
  systemPrompt: z.string().min(1),
  permissionMode: z.enum(permissionModes).default("askUser"),
  maxTurns: z.number().int().min(1).max(1000).default(100),
  builtinTools: z.array(z.string()).default([]),
  mcpServers: z.array(mcpServerSchema).default([]),
  allowedWorkItemTypes: z.array(z.string()).default(["*"]),
  defaultRole: z.enum(agentRoles).optional(),
  createdBy: z.string().min(1).default("system"),
});

const updateTemplateSchema = createTemplateSchema.partial().omit({ createdBy: true });

// Worker Schemas
const createWorkerSchema = z.object({
  templateId: z.string().uuid(),
});

const updateWorkerSchema = z.object({
  status: z.enum(workerStatuses).optional(),
  currentWorkItemId: z.string().uuid().nullable().optional(),
  currentRole: z.enum(agentRoles).nullable().optional(),
  contextWindowUsed: z.number().int().min(0).optional(),
  tokensUsed: z.number().int().min(0).optional(),
  costUsd: z.number().min(0).optional(),
  toolCalls: z.number().int().min(0).optional(),
  errors: z.number().int().min(0).optional(),
});

// Trace Schemas
const createTraceSchema = z.object({
  workerId: z.string().uuid().optional(),
  workItemId: z.string().uuid().optional(),
  eventType: z.enum(traceEventTypes),
  data: z.any().default({}),
});

// ========================================
// Work Item Schema Tests
// ========================================

describe("Work Item Schemas", () => {
  describe("createWorkItemSchema", () => {
    it("should validate a valid work item", () => {
      const validWorkItem = {
        title: "Implement authentication",
        type: "feature" as WorkItemType,
        description: "Add OAuth2 support",
        createdBy: "user-123",
      };

      const result = createWorkItemSchema.parse(validWorkItem);
      expect(result.title).toBe(validWorkItem.title);
      expect(result.type).toBe(validWorkItem.type);
      expect(result.successCriteria).toEqual([]);
      expect(result.linkedFiles).toEqual([]);
    });

    it("should apply default values", () => {
      const minimal = {
        title: "Fix bug",
        type: "bug" as WorkItemType,
        createdBy: "user-123",
      };

      const result = createWorkItemSchema.parse(minimal);
      expect(result.description).toBe("");
      expect(result.successCriteria).toEqual([]);
      expect(result.linkedFiles).toEqual([]);
    });

    it("should reject empty title", () => {
      const invalid = {
        title: "",
        type: "feature" as WorkItemType,
        createdBy: "user-123",
      };

      expect(() => createWorkItemSchema.parse(invalid)).toThrow();
    });

    it("should reject title longer than 200 chars", () => {
      const invalid = {
        title: "a".repeat(201),
        type: "feature" as WorkItemType,
        createdBy: "user-123",
      };

      expect(() => createWorkItemSchema.parse(invalid)).toThrow();
    });

    it("should reject invalid work item type", () => {
      const invalid = {
        title: "Test",
        type: "invalid-type",
        createdBy: "user-123",
      };

      expect(() => createWorkItemSchema.parse(invalid)).toThrow();
    });

    it("should validate success criteria", () => {
      const withCriteria = {
        title: "Test",
        type: "feature" as WorkItemType,
        createdBy: "user-123",
        successCriteria: [
          {
            id: "550e8400-e29b-41d4-a716-446655440000",
            description: "Tests pass",
            completed: false,
          },
        ],
      };

      const result = createWorkItemSchema.parse(withCriteria);
      expect(result.successCriteria).toHaveLength(1);
      expect(result.successCriteria[0].description).toBe("Tests pass");
    });

    it("should reject invalid success criterion UUID", () => {
      const invalid = {
        title: "Test",
        type: "feature" as WorkItemType,
        createdBy: "user-123",
        successCriteria: [
          {
            id: "not-a-uuid",
            description: "Tests pass",
            completed: false,
          },
        ],
      };

      expect(() => createWorkItemSchema.parse(invalid)).toThrow();
    });

    it("should validate parent ID as UUID", () => {
      const withParent = {
        title: "Test",
        type: "task" as WorkItemType,
        createdBy: "user-123",
        parentId: "550e8400-e29b-41d4-a716-446655440000",
      };

      const result = createWorkItemSchema.parse(withParent);
      expect(result.parentId).toBe(withParent.parentId);
    });

    it("should reject invalid parent UUID", () => {
      const invalid = {
        title: "Test",
        type: "task" as WorkItemType,
        createdBy: "user-123",
        parentId: "not-a-uuid",
      };

      expect(() => createWorkItemSchema.parse(invalid)).toThrow();
    });
  });

  describe("updateWorkItemSchema", () => {
    it("should allow partial updates", () => {
      const update = {
        title: "Updated title",
      };

      const result = updateWorkItemSchema.parse(update);
      expect(result.title).toBe(update.title);
      expect(result.status).toBeUndefined();
    });

    it("should validate status transitions", () => {
      const update = {
        status: "in_progress" as WorkItemStatus,
      };

      const result = updateWorkItemSchema.parse(update);
      expect(result.status).toBe("in_progress");
    });

    it("should reject invalid status", () => {
      const invalid = {
        status: "invalid-status",
      };

      expect(() => updateWorkItemSchema.parse(invalid)).toThrow();
    });

    it("should validate assigned agents map", () => {
      const update = {
        assignedAgents: {
          implementer: "worker-1",
          reviewer: "worker-2",
        },
      };

      const result = updateWorkItemSchema.parse(update);
      expect(result.assignedAgents).toEqual(update.assignedAgents);
    });

    it("should validate requires approval map", () => {
      const update = {
        requiresApproval: {
          code_changes: true,
          database_changes: false,
        },
      };

      const result = updateWorkItemSchema.parse(update);
      expect(result.requiresApproval).toEqual(update.requiresApproval);
    });
  });
});

// ========================================
// Template Schema Tests
// ========================================

describe("Template Schemas", () => {
  describe("createTemplateSchema", () => {
    it("should validate a valid template", () => {
      const validTemplate = {
        name: "Code Reviewer",
        description: "Reviews code for quality",
        systemPrompt: "You are a code reviewer...",
        createdBy: "system",
      };

      const result = createTemplateSchema.parse(validTemplate);
      expect(result.name).toBe(validTemplate.name);
      expect(result.permissionMode).toBe("askUser");
      expect(result.maxTurns).toBe(100);
      expect(result.builtinTools).toEqual([]);
    });

    it("should apply default values", () => {
      const minimal = {
        name: "Test Template",
        systemPrompt: "Test prompt",
      };

      const result = createTemplateSchema.parse(minimal);
      expect(result.description).toBe("");
      expect(result.permissionMode).toBe("askUser");
      expect(result.maxTurns).toBe(100);
      expect(result.createdBy).toBe("system");
      expect(result.builtinTools).toEqual([]);
      expect(result.mcpServers).toEqual([]);
      expect(result.allowedWorkItemTypes).toEqual(["*"]);
    });

    it("should validate permission modes", () => {
      const modes: PermissionMode[] = ["askUser", "acceptEdits", "bypassPermissions"];

      modes.forEach((mode) => {
        const template = {
          name: "Test",
          systemPrompt: "Test",
          permissionMode: mode,
        };

        const result = createTemplateSchema.parse(template);
        expect(result.permissionMode).toBe(mode);
      });
    });

    it("should reject invalid permission mode", () => {
      const invalid = {
        name: "Test",
        systemPrompt: "Test",
        permissionMode: "invalid-mode",
      };

      expect(() => createTemplateSchema.parse(invalid)).toThrow();
    });

    it("should validate max turns range", () => {
      const withMaxTurns = {
        name: "Test",
        systemPrompt: "Test",
        maxTurns: 50,
      };

      const result = createTemplateSchema.parse(withMaxTurns);
      expect(result.maxTurns).toBe(50);
    });

    it("should reject max turns below minimum", () => {
      const invalid = {
        name: "Test",
        systemPrompt: "Test",
        maxTurns: 0,
      };

      expect(() => createTemplateSchema.parse(invalid)).toThrow();
    });

    it("should reject max turns above maximum", () => {
      const invalid = {
        name: "Test",
        systemPrompt: "Test",
        maxTurns: 1001,
      };

      expect(() => createTemplateSchema.parse(invalid)).toThrow();
    });

    it("should validate builtin tools array", () => {
      const withTools = {
        name: "Test",
        systemPrompt: "Test",
        builtinTools: ["read", "write", "bash"],
      };

      const result = createTemplateSchema.parse(withTools);
      expect(result.builtinTools).toEqual(["read", "write", "bash"]);
    });

    it("should validate MCP servers", () => {
      const withMCP: MCPServerConfig = {
        name: "filesystem",
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem"],
        env: { PATH: "/usr/bin" },
      };

      const template = {
        name: "Test",
        systemPrompt: "Test",
        mcpServers: [withMCP],
      };

      const result = createTemplateSchema.parse(template);
      expect(result.mcpServers).toHaveLength(1);
      expect(result.mcpServers[0].name).toBe("filesystem");
    });

    it("should reject invalid MCP server type", () => {
      const invalid = {
        name: "Test",
        systemPrompt: "Test",
        mcpServers: [
          {
            name: "test",
            type: "invalid-type",
            args: [],
            env: {},
          },
        ],
      };

      expect(() => createTemplateSchema.parse(invalid)).toThrow();
    });

    it("should validate MCP server with URL (SSE type)", () => {
      const sseServer = {
        name: "remote-server",
        type: "sse" as const,
        url: "https://example.com/mcp",
        args: [],
        env: {},
      };

      const template = {
        name: "Test",
        systemPrompt: "Test",
        mcpServers: [sseServer],
      };

      const result = createTemplateSchema.parse(template);
      expect(result.mcpServers[0].type).toBe("sse");
      expect(result.mcpServers[0].url).toBe("https://example.com/mcp");
    });

    it("should validate default role", () => {
      const withRole = {
        name: "Test",
        systemPrompt: "Test",
        defaultRole: "implementer" as const,
      };

      const result = createTemplateSchema.parse(withRole);
      expect(result.defaultRole).toBe("implementer");
    });

    it("should reject invalid default role", () => {
      const invalid = {
        name: "Test",
        systemPrompt: "Test",
        defaultRole: "invalid-role",
      };

      expect(() => createTemplateSchema.parse(invalid)).toThrow();
    });

    it("should validate allowed work item types", () => {
      const withTypes = {
        name: "Test",
        systemPrompt: "Test",
        allowedWorkItemTypes: ["feature", "bug"],
      };

      const result = createTemplateSchema.parse(withTypes);
      expect(result.allowedWorkItemTypes).toEqual(["feature", "bug"]);
    });
  });

  describe("updateTemplateSchema", () => {
    it("should allow partial updates", () => {
      const update = {
        name: "Updated Template",
        maxTurns: 200,
      };

      const result = updateTemplateSchema.parse(update);
      expect(result.name).toBe(update.name);
      expect(result.maxTurns).toBe(200);
    });

    it("should not allow updating createdBy", () => {
      const schema = updateTemplateSchema;
      // createdBy should be omitted from the schema
      expect(schema.shape.createdBy).toBeUndefined();
    });
  });
});

// ========================================
// Worker Schema Tests
// ========================================

describe("Worker Schemas", () => {
  describe("createWorkerSchema", () => {
    it("should validate a valid worker creation", () => {
      const validWorker = {
        templateId: "550e8400-e29b-41d4-a716-446655440000",
      };

      const result = createWorkerSchema.parse(validWorker);
      expect(result.templateId).toBe(validWorker.templateId);
    });

    it("should reject invalid template UUID", () => {
      const invalid = {
        templateId: "not-a-uuid",
      };

      expect(() => createWorkerSchema.parse(invalid)).toThrow();
    });
  });

  describe("updateWorkerSchema", () => {
    it("should allow partial updates", () => {
      const update = {
        status: "working" as WorkerStatus,
        tokensUsed: 1000,
      };

      const result = updateWorkerSchema.parse(update);
      expect(result.status).toBe("working");
      expect(result.tokensUsed).toBe(1000);
    });

    it("should validate all worker statuses", () => {
      const statuses: WorkerStatus[] = ["idle", "working", "paused", "error", "terminated"];

      statuses.forEach((status) => {
        const update = { status };
        const result = updateWorkerSchema.parse(update);
        expect(result.status).toBe(status);
      });
    });

    it("should reject invalid status", () => {
      const invalid = {
        status: "invalid-status",
      };

      expect(() => updateWorkerSchema.parse(invalid)).toThrow();
    });

    it("should validate metrics are non-negative", () => {
      const update = {
        contextWindowUsed: 50000,
        tokensUsed: 10000,
        costUsd: 0.05,
        toolCalls: 25,
        errors: 0,
      };

      const result = updateWorkerSchema.parse(update);
      expect(result.contextWindowUsed).toBe(50000);
      expect(result.tokensUsed).toBe(10000);
      expect(result.costUsd).toBe(0.05);
      expect(result.toolCalls).toBe(25);
      expect(result.errors).toBe(0);
    });

    it("should reject negative tokens used", () => {
      const invalid = {
        tokensUsed: -100,
      };

      expect(() => updateWorkerSchema.parse(invalid)).toThrow();
    });

    it("should reject negative cost", () => {
      const invalid = {
        costUsd: -0.05,
      };

      expect(() => updateWorkerSchema.parse(invalid)).toThrow();
    });

    it("should allow null for current work item and role", () => {
      const update = {
        currentWorkItemId: null,
        currentRole: null,
      };

      const result = updateWorkerSchema.parse(update);
      expect(result.currentWorkItemId).toBeNull();
      expect(result.currentRole).toBeNull();
    });
  });
});

// ========================================
// Trace Schema Tests
// ========================================

describe("Trace Schemas", () => {
  describe("createTraceSchema", () => {
    it("should validate a valid trace event", () => {
      const validTrace = {
        workerId: "550e8400-e29b-41d4-a716-446655440000",
        workItemId: "550e8400-e29b-41d4-a716-446655440001",
        eventType: "tool_call" as TraceEventType,
        data: { tool: "bash", command: "ls" },
      };

      const result = createTraceSchema.parse(validTrace);
      expect(result.eventType).toBe("tool_call");
      expect(result.data).toEqual({ tool: "bash", command: "ls" });
    });

    it("should allow optional worker and work item IDs", () => {
      const trace = {
        eventType: "agent_state" as TraceEventType,
        data: { state: "thinking" },
      };

      const result = createTraceSchema.parse(trace);
      expect(result.workerId).toBeUndefined();
      expect(result.workItemId).toBeUndefined();
    });

    it("should apply default empty data object", () => {
      const minimal = {
        eventType: "metric_update" as TraceEventType,
      };

      const result = createTraceSchema.parse(minimal);
      expect(result.data).toEqual({});
    });

    it("should validate all event types", () => {
      const eventTypes: TraceEventType[] = [
        "agent_state",
        "work_item_update",
        "tool_call",
        "metric_update",
        "error",
        "approval_required",
      ];

      eventTypes.forEach((eventType) => {
        const trace = { eventType };
        const result = createTraceSchema.parse(trace);
        expect(result.eventType).toBe(eventType);
      });
    });

    it("should reject invalid event type", () => {
      const invalid = {
        eventType: "invalid-type",
      };

      expect(() => createTraceSchema.parse(invalid)).toThrow();
    });

    it("should validate complex data objects", () => {
      const complexData = {
        nested: {
          objects: {
            are: "supported",
          },
        },
        arrays: [1, 2, 3],
        mixed: {
          number: 42,
          string: "test",
          boolean: true,
          null: null,
        },
      };

      const trace = {
        eventType: "agent_state" as TraceEventType,
        data: complexData,
      };

      const result = createTraceSchema.parse(trace);
      expect(result.data).toEqual(complexData);
    });
  });
});

// ========================================
// Type Coercion Tests
// ========================================

describe("Type Coercion", () => {
  it("should coerce string numbers to numbers for maxTurns", () => {
    const template = {
      name: "Test",
      systemPrompt: "Test",
      maxTurns: "150" as unknown as number,
    };

    // Zod can coerce if .coerce() is used, but our schemas don't use it
    // This test documents current behavior
    expect(() => createTemplateSchema.parse(template)).toThrow();
  });

  it("should not coerce boolean to string for type field", () => {
    const workItem = {
      title: "Test",
      type: true,
      createdBy: "user-123",
    };

    expect(() => createWorkItemSchema.parse(workItem)).toThrow();
  });

  it("should not accept null for required fields", () => {
    const invalid = {
      title: null,
      type: "feature",
      createdBy: "user-123",
    };

    expect(() => createWorkItemSchema.parse(invalid)).toThrow();
  });
});

// Export schemas for use in other tests
export {
  successCriterionSchema,
  createWorkItemSchema,
  updateWorkItemSchema,
  mcpServerSchema,
  createTemplateSchema,
  updateTemplateSchema,
  createWorkerSchema,
  updateWorkerSchema,
  createTraceSchema,
};
