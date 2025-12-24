import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../shared/db/schema.js";
import { TemplateRepository } from "../repositories/template.repository.js";
import { TemplateRegistryService } from "../services/template-registry.service.js";
import type {
  CreateAgentTemplate,
  UpdateAgentTemplate,
} from "../models/template.js";
import type { AgentRole, WorkItemType, Template } from "../../shared/db/schema.js";

describe("TemplateRegistryService", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let repository: TemplateRepository;
  let service: TemplateRegistryService;

  beforeEach(() => {
    // Create in-memory database for each test
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    db = drizzle(sqlite, { schema });

    // Create schema
    sqlite.exec(`
      CREATE TABLE templates (
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
      )
    `);

    repository = new TemplateRepository(db);
    service = new TemplateRegistryService(repository);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("register", () => {
    it("should register a valid user template", async () => {
      const template: CreateAgentTemplate = {
        name: "Custom Implementer",
        description: "My custom implementation template",
        createdBy: "user-123",
        systemPrompt:
          "You are a custom implementer agent with specific behaviors.",
        permissionMode: "acceptEdits",
        maxTurns: 100,
        builtinTools: ["read", "write"],
        mcpServers: [],
        allowedWorkItemTypes: ["feature", "bug"],
        defaultRole: "implementer",
      };

      const created = await service.register(template);

      expect(created).toMatchObject({
        name: "Custom Implementer",
        description: "My custom implementation template",
        createdBy: "user-123",
        permissionMode: "acceptEdits",
        maxTurns: 100,
        defaultRole: "implementer",
      });
      expect(created.id).toBeDefined();
      expect(created.createdAt).toBeInstanceOf(Date);
      expect(created.updatedAt).toBeInstanceOf(Date);
      expect(created.builtinTools).toEqual(["read", "write"]);
      expect(created.allowedWorkItemTypes).toEqual(["feature", "bug"]);
    });

    it("should register a minimal template", async () => {
      const template: CreateAgentTemplate = {
        name: "Minimal Template",
        createdBy: "user-456",
        systemPrompt: "This is a minimal system prompt for testing purposes.",
      };

      const created = await service.register(template);

      expect(created.name).toBe("Minimal Template");
      expect(created.description).toBe("");
      expect(created.permissionMode).toBe("askUser");
      expect(created.maxTurns).toBe(100);
      expect(created.builtinTools).toEqual([]);
      expect(created.mcpServers).toEqual([]);
      expect(created.allowedWorkItemTypes).toEqual(["*"]);
    });

    it("should throw error for duplicate name", async () => {
      const template1: CreateAgentTemplate = {
        name: "Duplicate Name",
        createdBy: "user-1",
        systemPrompt: "First template with this name.",
      };

      const template2: CreateAgentTemplate = {
        name: "Duplicate Name",
        createdBy: "user-2",
        systemPrompt: "Second template with same name.",
      };

      await service.register(template1);

      await expect(service.register(template2)).rejects.toThrow(
        "Template with name 'Duplicate Name' already exists"
      );
    });

    it("should throw error for case-insensitive duplicate name", async () => {
      const template1: CreateAgentTemplate = {
        name: "Test Template",
        createdBy: "user-1",
        systemPrompt: "First template with sufficient length for validation.",
      };

      const template2: CreateAgentTemplate = {
        name: "test template",
        createdBy: "user-2",
        systemPrompt: "Second template with sufficient length for validation.",
      };

      await service.register(template1);

      await expect(service.register(template2)).rejects.toThrow(
        "Template with name 'test template' already exists"
      );
    });

    it("should validate empty name", async () => {
      const template: CreateAgentTemplate = {
        name: "   ",
        createdBy: "user-1",
        systemPrompt: "Valid system prompt.",
      };

      await expect(service.register(template)).rejects.toThrow(
        "Template name cannot be empty"
      );
    });

    it("should validate name length", async () => {
      const template: CreateAgentTemplate = {
        name: "x".repeat(101),
        createdBy: "user-1",
        systemPrompt: "Valid system prompt.",
      };

      await expect(service.register(template)).rejects.toThrow(
        "Template name cannot exceed 100 characters"
      );
    });

    it("should validate system prompt is not empty", async () => {
      const template: CreateAgentTemplate = {
        name: "Test Template",
        createdBy: "user-1",
        systemPrompt: "   ",
      };

      await expect(service.register(template)).rejects.toThrow(
        "System prompt cannot be empty"
      );
    });

    it("should validate system prompt minimum length", async () => {
      const template: CreateAgentTemplate = {
        name: "Test Template",
        createdBy: "user-1",
        systemPrompt: "Too short",
      };

      await expect(service.register(template)).rejects.toThrow(
        "System prompt must be at least 20 characters"
      );
    });

    it("should validate maxTurns is positive", async () => {
      const template: CreateAgentTemplate = {
        name: "Test Template",
        createdBy: "user-1",
        systemPrompt: "Valid system prompt for testing.",
        maxTurns: 0,
      };

      // Zod schema validation catches this first
      await expect(service.register(template)).rejects.toThrow(
        "Template validation failed"
      );
    });

    it("should validate maxTurns does not exceed limit", async () => {
      const template: CreateAgentTemplate = {
        name: "Test Template",
        createdBy: "user-1",
        systemPrompt: "Valid system prompt for testing.",
        maxTurns: 1001,
      };

      await expect(service.register(template)).rejects.toThrow(
        "Max turns cannot exceed 1000"
      );
    });

    it("should validate allowedWorkItemTypes is not empty", async () => {
      const template: CreateAgentTemplate = {
        name: "Test Template",
        createdBy: "user-1",
        systemPrompt: "Valid system prompt for testing.",
        allowedWorkItemTypes: [],
      };

      await expect(service.register(template)).rejects.toThrow(
        "At least one allowed work item type must be specified"
      );
    });

    it("should validate MCP server configuration - stdio", async () => {
      const template: CreateAgentTemplate = {
        name: "Test Template",
        createdBy: "user-1",
        systemPrompt: "Valid system prompt for testing.",
        mcpServers: [
          {
            name: "test-server",
            type: "stdio",
            args: [],
            env: {},
          },
        ],
      };

      await expect(service.register(template)).rejects.toThrow(
        "MCP server 'test-server' with type 'stdio' must have a command"
      );
    });

    it("should validate MCP server configuration - sse", async () => {
      const template: CreateAgentTemplate = {
        name: "Test Template",
        createdBy: "user-1",
        systemPrompt: "Valid system prompt for testing.",
        mcpServers: [
          {
            name: "test-server",
            type: "sse",
            args: [],
            env: {},
          },
        ],
      };

      await expect(service.register(template)).rejects.toThrow(
        "MCP server 'test-server' with type 'sse' must have a URL"
      );
    });

    it("should validate MCP server names are unique", async () => {
      const template: CreateAgentTemplate = {
        name: "Test Template",
        createdBy: "user-1",
        systemPrompt: "Valid system prompt for testing.",
        mcpServers: [
          {
            name: "duplicate-server",
            type: "stdio",
            command: "cmd1",
            args: [],
            env: {},
          },
          {
            name: "Duplicate-Server",
            type: "stdio",
            command: "cmd2",
            args: [],
            env: {},
          },
        ],
      };

      await expect(service.register(template)).rejects.toThrow(
        "MCP server names must be unique within a template"
      );
    });

    it("should register template with valid MCP servers", async () => {
      const template: CreateAgentTemplate = {
        name: "MCP Template",
        createdBy: "user-1",
        systemPrompt: "Template with MCP servers for testing.",
        mcpServers: [
          {
            name: "filesystem",
            type: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem"],
            env: {},
          },
          {
            name: "api-server",
            type: "sse",
            url: "http://localhost:3000",
            args: [],
            env: { API_KEY: "test" },
          },
        ],
      };

      const created = await service.register(template);

      expect(created.mcpServers).toHaveLength(2);
      expect(created.mcpServers[0]?.name).toBe("filesystem");
      expect(created.mcpServers[1]?.name).toBe("api-server");
    });
  });

  describe("unregister", () => {
    it("should unregister a user template", async () => {
      const template: CreateAgentTemplate = {
        name: "User Template",
        createdBy: "user-123",
        systemPrompt: "A user-created template for testing.",
      };

      const created = await service.register(template);
      await service.unregister(created.id);

      const found = await service.getById(created.id);
      expect(found).toBeNull();
    });

    it("should throw error when unregistering system template", async () => {
      const systemTemplate: CreateAgentTemplate = {
        name: "System Template",
        createdBy: "system",
        systemPrompt: "A system template that cannot be deleted.",
      };

      const created = await service.register(systemTemplate);

      await expect(service.unregister(created.id)).rejects.toThrow(
        "Cannot delete system template"
      );

      // Verify it still exists
      const found = await service.getById(created.id);
      expect(found).not.toBeNull();
    });

    it("should throw error when unregistering non-existent template", async () => {
      await expect(service.unregister("non-existent-id")).rejects.toThrow(
        "Template with ID non-existent-id not found"
      );
    });
  });

  describe("getById", () => {
    it("should get a template by ID", async () => {
      const template: CreateAgentTemplate = {
        name: "Findable Template",
        createdBy: "user-123",
        systemPrompt: "A template that can be found by ID.",
      };

      const created = await service.register(template);
      const found = await service.getById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe("Findable Template");
    });

    it("should return null for non-existent ID", async () => {
      const found = await service.getById("non-existent");
      expect(found).toBeNull();
    });
  });

  describe("getAll", () => {
    it("should return all templates", async () => {
      const templates: CreateAgentTemplate[] = [
        {
          name: "Template 1",
          createdBy: "user-1",
          systemPrompt: "System prompt for template 1.",
        },
        {
          name: "Template 2",
          createdBy: "user-2",
          systemPrompt: "System prompt for template 2.",
        },
        {
          name: "Template 3",
          createdBy: "system",
          systemPrompt: "System prompt for template 3.",
        },
      ];

      for (const template of templates) {
        await service.register(template);
      }

      const all = await service.getAll();

      expect(all).toHaveLength(3);
      expect(all.map((t) => t.name)).toContain("Template 1");
      expect(all.map((t) => t.name)).toContain("Template 2");
      expect(all.map((t) => t.name)).toContain("Template 3");
    });

    it("should return empty array when no templates exist", async () => {
      const all = await service.getAll();
      expect(all).toEqual([]);
    });
  });

  describe("getBuiltIn", () => {
    it("should return only system templates", async () => {
      const templates: CreateAgentTemplate[] = [
        {
          name: "System Template 1",
          createdBy: "system",
          systemPrompt: "System prompt for system template 1.",
        },
        {
          name: "System Template 2",
          createdBy: "system",
          systemPrompt: "System prompt for system template 2.",
        },
        {
          name: "User Template",
          createdBy: "user-123",
          systemPrompt: "System prompt for user template.",
        },
      ];

      for (const template of templates) {
        await service.register(template);
      }

      const builtIn = await service.getBuiltIn();

      expect(builtIn).toHaveLength(2);
      expect(builtIn.map((t) => t.name)).toContain("System Template 1");
      expect(builtIn.map((t) => t.name)).toContain("System Template 2");
      expect(builtIn.every((t) => t.createdBy === "system")).toBe(true);
    });

    it("should return empty array when no system templates exist", async () => {
      const userTemplate: CreateAgentTemplate = {
        name: "User Template",
        createdBy: "user-123",
        systemPrompt: "A user template with sufficient length for validation.",
      };

      await service.register(userTemplate);
      const builtIn = await service.getBuiltIn();

      expect(builtIn).toEqual([]);
    });
  });

  describe("getUserDefined", () => {
    it("should return templates created by specific user", async () => {
      const templates: CreateAgentTemplate[] = [
        {
          name: "User 1 Template A",
          createdBy: "user-1",
          systemPrompt: "Template A created by user 1 with sufficient length.",
        },
        {
          name: "User 1 Template B",
          createdBy: "user-1",
          systemPrompt: "Template B created by user 1 with sufficient length.",
        },
        {
          name: "User 2 Template",
          createdBy: "user-2",
          systemPrompt: "Template created by user 2 with sufficient length.",
        },
        {
          name: "System Template",
          createdBy: "system",
          systemPrompt: "System template with sufficient length for validation.",
        },
      ];

      for (const template of templates) {
        await service.register(template);
      }

      const user1Templates = await service.getUserDefined("user-1");

      expect(user1Templates).toHaveLength(2);
      expect(user1Templates.map((t) => t.name)).toContain("User 1 Template A");
      expect(user1Templates.map((t) => t.name)).toContain("User 1 Template B");
      expect(user1Templates.every((t) => t.createdBy === "user-1")).toBe(true);
    });

    it("should return empty array for user with no templates", async () => {
      const templates = await service.getUserDefined("user-with-no-templates");
      expect(templates).toEqual([]);
    });
  });

  describe("findByRole", () => {
    it("should find templates by default role", async () => {
      const templates: CreateAgentTemplate[] = [
        {
          name: "Implementer 1",
          createdBy: "user-1",
          systemPrompt: "Implementer template 1 with sufficient length for validation.",
          defaultRole: "implementer",
        },
        {
          name: "Implementer 2",
          createdBy: "user-2",
          systemPrompt: "Implementer template 2 with sufficient length for validation.",
          defaultRole: "implementer",
        },
        {
          name: "Refiner",
          createdBy: "system",
          systemPrompt: "Refiner template with sufficient length for validation.",
          defaultRole: "refiner",
        },
        {
          name: "No Role",
          createdBy: "user-3",
          systemPrompt: "Template without default role but with sufficient length.",
        },
      ];

      for (const template of templates) {
        await service.register(template);
      }

      const implementers = await service.findByRole("implementer");
      expect(implementers).toHaveLength(2);
      expect(implementers.map((t) => t.name)).toContain("Implementer 1");
      expect(implementers.map((t) => t.name)).toContain("Implementer 2");

      const refiners = await service.findByRole("refiner");
      expect(refiners).toHaveLength(1);
      expect(refiners[0]?.name).toBe("Refiner");

      const testers = await service.findByRole("tester");
      expect(testers).toEqual([]);
    });
  });

  describe("findForWorkItemType", () => {
    it("should find templates that allow all work item types", async () => {
      const templates: CreateAgentTemplate[] = [
        {
          name: "Universal Template",
          createdBy: "user-1",
          systemPrompt: "Works with all work item types.",
          allowedWorkItemTypes: ["*"],
        },
        {
          name: "Feature-Only Template",
          createdBy: "user-2",
          systemPrompt: "Only works with features.",
          allowedWorkItemTypes: ["feature"],
        },
      ];

      for (const template of templates) {
        await service.register(template);
      }

      const featureTemplates = await service.findForWorkItemType("feature");
      expect(featureTemplates).toHaveLength(2);

      const bugTemplates = await service.findForWorkItemType("bug");
      expect(bugTemplates).toHaveLength(1);
      expect(bugTemplates[0]?.name).toBe("Universal Template");
    });

    it("should find templates by specific work item type", async () => {
      const templates: CreateAgentTemplate[] = [
        {
          name: "Feature & Bug Template",
          createdBy: "user-1",
          systemPrompt: "Works with features and bugs.",
          allowedWorkItemTypes: ["feature", "bug"],
        },
        {
          name: "Task Template",
          createdBy: "user-2",
          systemPrompt: "Only works with tasks.",
          allowedWorkItemTypes: ["task"],
        },
        {
          name: "Research Template",
          createdBy: "user-3",
          systemPrompt: "Only works with research items.",
          allowedWorkItemTypes: ["research"],
        },
      ];

      for (const template of templates) {
        await service.register(template);
      }

      const featureTemplates = await service.findForWorkItemType("feature");
      expect(featureTemplates).toHaveLength(1);
      expect(featureTemplates[0]?.name).toBe("Feature & Bug Template");

      const taskTemplates = await service.findForWorkItemType("task");
      expect(taskTemplates).toHaveLength(1);
      expect(taskTemplates[0]?.name).toBe("Task Template");

      const researchTemplates = await service.findForWorkItemType("research");
      expect(researchTemplates).toHaveLength(1);
      expect(researchTemplates[0]?.name).toBe("Research Template");
    });
  });

  describe("update", () => {
    it("should update template fields", async () => {
      const template: CreateAgentTemplate = {
        name: "Original Name",
        description: "Original description",
        createdBy: "user-123",
        systemPrompt: "Original system prompt for testing.",
        maxTurns: 50,
      };

      const created = await service.register(template);

      const updates: UpdateAgentTemplate = {
        name: "Updated Name",
        description: "Updated description",
        systemPrompt: "Updated system prompt for testing purposes.",
        maxTurns: 75,
      };

      const updated = await service.update(created.id, updates);

      expect(updated.name).toBe("Updated Name");
      expect(updated.description).toBe("Updated description");
      expect(updated.systemPrompt).toBe(
        "Updated system prompt for testing purposes."
      );
      expect(updated.maxTurns).toBe(75);
      expect(updated.createdBy).toBe("user-123"); // Should remain unchanged
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
        created.updatedAt.getTime()
      );
    });

    it("should update builtin tools", async () => {
      const template: CreateAgentTemplate = {
        name: "Tools Template",
        createdBy: "user-123",
        systemPrompt: "Template with builtin tools.",
        builtinTools: ["read"],
      };

      const created = await service.register(template);

      const updated = await service.update(created.id, {
        builtinTools: ["read", "write", "edit"],
      });

      expect(updated.builtinTools).toEqual(["read", "write", "edit"]);
    });

    it("should check name uniqueness when updating", async () => {
      const template1: CreateAgentTemplate = {
        name: "Template 1",
        createdBy: "user-1",
        systemPrompt: "First template with sufficient length for validation.",
      };

      const template2: CreateAgentTemplate = {
        name: "Template 2",
        createdBy: "user-2",
        systemPrompt: "Second template with sufficient length for validation.",
      };

      const created1 = await service.register(template1);
      await service.register(template2);

      await expect(
        service.update(created1.id, { name: "Template 2" })
      ).rejects.toThrow(
        "Template with name 'Template 2' already exists"
      );
    });

    it("should allow updating to same name", async () => {
      const template: CreateAgentTemplate = {
        name: "Same Name",
        createdBy: "user-1",
        systemPrompt: "Template with same name.",
      };

      const created = await service.register(template);

      const updated = await service.update(created.id, {
        name: "Same Name",
        description: "Updated description",
      });

      expect(updated.name).toBe("Same Name");
      expect(updated.description).toBe("Updated description");
    });

    it("should throw error when updating non-existent template", async () => {
      await expect(
        service.update("non-existent-id", { name: "New Name" })
      ).rejects.toThrow("Template with ID non-existent-id not found");
    });
  });

  describe("clone", () => {
    it("should clone a template with new name", async () => {
      const original: CreateAgentTemplate = {
        name: "Original Template",
        description: "Original description",
        createdBy: "user-1",
        systemPrompt: "Original system prompt for cloning test.",
        permissionMode: "acceptEdits",
        maxTurns: 75,
        builtinTools: ["read", "write"],
        mcpServers: [
          {
            name: "test-server",
            type: "stdio",
            command: "test-cmd",
            args: ["arg1"],
            env: { KEY: "value" },
          },
        ],
        allowedWorkItemTypes: ["feature", "bug"],
        defaultRole: "implementer",
      };

      const created = await service.register(original);

      const cloned = await service.clone(created.id, "Cloned Template", "user-2");

      expect(cloned.id).not.toBe(created.id);
      expect(cloned.name).toBe("Cloned Template");
      expect(cloned.description).toContain("cloned");
      expect(cloned.createdBy).toBe("user-2");
      expect(cloned.systemPrompt).toBe(original.systemPrompt);
      expect(cloned.permissionMode).toBe(original.permissionMode);
      expect(cloned.maxTurns).toBe(original.maxTurns);
      expect(cloned.builtinTools).toEqual(original.builtinTools);
      expect(cloned.allowedWorkItemTypes).toEqual(original.allowedWorkItemTypes);
      expect(cloned.defaultRole).toBe(original.defaultRole);
      expect(cloned.mcpServers).toHaveLength(1);
      expect(cloned.mcpServers[0]?.name).toBe("test-server");
    });

    it("should throw error when cloning non-existent template", async () => {
      await expect(
        service.clone("non-existent", "New Name", "user-1")
      ).rejects.toThrow("Source template with ID non-existent not found");
    });

    it("should throw error when clone name already exists", async () => {
      const template1: CreateAgentTemplate = {
        name: "Template 1",
        createdBy: "user-1",
        systemPrompt: "First template with sufficient length for validation.",
      };

      const template2: CreateAgentTemplate = {
        name: "Existing Name",
        createdBy: "user-2",
        systemPrompt: "Second template with sufficient length for validation.",
      };

      const created1 = await service.register(template1);
      await service.register(template2);

      await expect(
        service.clone(created1.id, "Existing Name", "user-3")
      ).rejects.toThrow(
        "Template with name 'Existing Name' already exists"
      );
    });
  });

  describe("initializeBuiltIns", () => {
    it("should initialize built-in templates", async () => {
      const count = await service.initializeBuiltIns();

      expect(count).toBe(4); // Refiner, Implementer, Tester, Reviewer

      const builtIns = await service.getBuiltIn();
      expect(builtIns).toHaveLength(4);

      const names = builtIns.map((t) => t.name);
      expect(names).toContain("Refiner Agent");
      expect(names).toContain("Implementer Agent");
      expect(names).toContain("Tester Agent");
      expect(names).toContain("Reviewer Agent");

      // Verify they all have system as creator
      expect(builtIns.every((t) => t.createdBy === "system")).toBe(true);
    });

    it("should be idempotent (safe to call multiple times)", async () => {
      const count1 = await service.initializeBuiltIns();
      expect(count1).toBe(4);

      const count2 = await service.initializeBuiltIns();
      expect(count2).toBe(0); // No new templates created

      const builtIns = await service.getBuiltIn();
      expect(builtIns).toHaveLength(4); // Still only 4 templates
    });

    it("should initialize missing built-in templates", async () => {
      // Manually create one built-in template
      const refiner: CreateAgentTemplate = {
        name: "Refiner Agent",
        createdBy: "system",
        systemPrompt: "Existing refiner template.",
      };
      await service.register(refiner);

      // Initialize built-ins (should create the remaining 3)
      const count = await service.initializeBuiltIns();
      expect(count).toBe(3); // Only 3 new templates

      const builtIns = await service.getBuiltIn();
      expect(builtIns).toHaveLength(4); // Total of 4
    });

    it("should create built-ins with correct roles", async () => {
      await service.initializeBuiltIns();

      const refiners = await service.findByRole("refiner");
      expect(refiners.length).toBeGreaterThanOrEqual(1);
      expect(refiners.some((t) => t.name === "Refiner Agent")).toBe(true);

      const implementers = await service.findByRole("implementer");
      expect(implementers.length).toBeGreaterThanOrEqual(1);
      expect(implementers.some((t) => t.name === "Implementer Agent")).toBe(
        true
      );

      const testers = await service.findByRole("tester");
      expect(testers.length).toBeGreaterThanOrEqual(1);
      expect(testers.some((t) => t.name === "Tester Agent")).toBe(true);

      const reviewers = await service.findByRole("reviewer");
      expect(reviewers.length).toBeGreaterThanOrEqual(1);
      expect(reviewers.some((t) => t.name === "Reviewer Agent")).toBe(true);
    });

    it("should create built-ins with appropriate permissions", async () => {
      await service.initializeBuiltIns();

      const all = await service.getBuiltIn();

      const implementer = all.find((t) => t.name === "Implementer Agent");
      expect(implementer?.permissionMode).toBe("acceptEdits");

      const refiner = all.find((t) => t.name === "Refiner Agent");
      expect(refiner?.permissionMode).toBe("askUser");

      const tester = all.find((t) => t.name === "Tester Agent");
      expect(tester?.permissionMode).toBe("askUser");

      const reviewer = all.find((t) => t.name === "Reviewer Agent");
      expect(reviewer?.permissionMode).toBe("askUser");
    });
  });

  describe("validate", () => {
    it("should validate empty name", async () => {
      const template: CreateAgentTemplate = {
        name: "",
        createdBy: "user-1",
        systemPrompt: "Valid system prompt for testing.",
      };

      // Zod schema validation catches this first
      await expect(service.register(template)).rejects.toThrow(
        "Template validation failed"
      );
    });

    it("should validate whitespace-only name", async () => {
      const template: CreateAgentTemplate = {
        name: "   ",
        createdBy: "user-1",
        systemPrompt: "Valid system prompt for testing.",
      };

      await expect(service.register(template)).rejects.toThrow(
        "Template name cannot be empty"
      );
    });

    it("should validate empty system prompt", async () => {
      const template: CreateAgentTemplate = {
        name: "Valid Name",
        createdBy: "user-1",
        systemPrompt: "",
      };

      // Zod schema validation catches this first
      await expect(service.register(template)).rejects.toThrow(
        "Template validation failed"
      );
    });

    it("should validate whitespace-only system prompt", async () => {
      const template: CreateAgentTemplate = {
        name: "Valid Name",
        createdBy: "user-1",
        systemPrompt: "   ",
      };

      await expect(service.register(template)).rejects.toThrow(
        "System prompt cannot be empty"
      );
    });
  });

  describe("edge cases", () => {
    it("should handle templates with no default role", async () => {
      const template: CreateAgentTemplate = {
        name: "No Role Template",
        createdBy: "user-1",
        systemPrompt: "Template without a default role.",
      };

      const created = await service.register(template);
      // SQLite returns null for undefined
      expect(created.defaultRole).toBeNull();
    });

    it("should handle templates with all permission modes", async () => {
      const modes: Array<"askUser" | "acceptEdits" | "bypassPermissions"> = [
        "askUser",
        "acceptEdits",
        "bypassPermissions",
      ];

      for (const mode of modes) {
        const template: CreateAgentTemplate = {
          name: `Template ${mode}`,
          createdBy: "user-1",
          systemPrompt: `Template with ${mode} permission mode.`,
          permissionMode: mode,
        };

        const created = await service.register(template);
        expect(created.permissionMode).toBe(mode);
      }
    });

    it("should handle complex MCP server configurations", async () => {
      const template: CreateAgentTemplate = {
        name: "Complex MCP Template",
        createdBy: "user-1",
        systemPrompt: "Template with complex MCP configuration.",
        mcpServers: [
          {
            name: "filesystem",
            type: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
            env: { NODE_ENV: "production", DEBUG: "true" },
          },
          {
            name: "api-server",
            type: "sse",
            url: "https://api.example.com/mcp",
            args: [],
            env: { API_KEY: "secret-key", TIMEOUT: "30000" },
          },
        ],
      };

      const created = await service.register(template);

      expect(created.mcpServers).toHaveLength(2);
      expect(created.mcpServers[0]?.env).toEqual({
        NODE_ENV: "production",
        DEBUG: "true",
      });
      expect(created.mcpServers[1]?.env).toEqual({
        API_KEY: "secret-key",
        TIMEOUT: "30000",
      });
    });
  });
});
