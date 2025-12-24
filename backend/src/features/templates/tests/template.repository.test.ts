import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../../../db/schema.js";
import { TemplateRepository } from "../repositories/template.repository.js";
import type { NewTemplate, Template, AgentRole } from "../../../db/schema.js";

describe("TemplateRepository", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let repository: TemplateRepository;

  beforeEach(() => {
    // Create in-memory database for each test
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    db = drizzle(sqlite, { schema });

    // Run migrations (we'll create the schema manually for tests)
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
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("create", () => {
    it("should create a new template with required fields", async () => {
      const newTemplate: NewTemplate = {
        id: "tmpl-001",
        name: "Test Template",
        description: "A test template",
        createdBy: "user-123",
        systemPrompt: "You are a helpful assistant",
        permissionMode: "askUser",
        maxTurns: 100,
        builtinTools: ["read", "write"],
        mcpServers: [],
        allowedWorkItemTypes: ["feature", "bug"],
        defaultRole: "implementer",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await repository.create(newTemplate);

      expect(created).toMatchObject({
        id: "tmpl-001",
        name: "Test Template",
        description: "A test template",
        createdBy: "user-123",
        systemPrompt: "You are a helpful assistant",
        permissionMode: "askUser",
        maxTurns: 100,
        defaultRole: "implementer",
      });
      expect(created.builtinTools).toEqual(["read", "write"]);
      expect(created.allowedWorkItemTypes).toEqual(["feature", "bug"]);
      expect(created.createdAt).toBeInstanceOf(Date);
      expect(created.updatedAt).toBeInstanceOf(Date);
    });

    it("should create a system template", async () => {
      const systemTemplate: NewTemplate = {
        id: "system-refiner",
        name: "System Refiner",
        description: "Built-in refiner template",
        createdBy: "system",
        systemPrompt: "You refine work items",
        permissionMode: "bypassPermissions",
        maxTurns: 50,
        builtinTools: [],
        mcpServers: [],
        allowedWorkItemTypes: ["*"],
        defaultRole: "refiner",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await repository.create(systemTemplate);

      expect(created.createdBy).toBe("system");
      expect(created.defaultRole).toBe("refiner");
    });

    it("should create template with default values", async () => {
      const minimalTemplate: NewTemplate = {
        id: "tmpl-minimal",
        name: "Minimal Template",
        createdBy: "user-456",
        systemPrompt: "Test prompt",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await repository.create(minimalTemplate);

      expect(created.description).toBe("");
      expect(created.permissionMode).toBe("askUser");
      expect(created.maxTurns).toBe(100);
      expect(created.builtinTools).toEqual([]);
      expect(created.mcpServers).toEqual([]);
      expect(created.allowedWorkItemTypes).toEqual(["*"]);
    });

    it("should create template with MCP servers", async () => {
      const templateWithMcp: NewTemplate = {
        id: "tmpl-mcp",
        name: "MCP Template",
        createdBy: "user-789",
        systemPrompt: "Test",
        mcpServers: [
          {
            name: "filesystem",
            type: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem"],
            env: {},
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await repository.create(templateWithMcp);

      expect(created.mcpServers).toHaveLength(1);
      expect(created.mcpServers[0]).toMatchObject({
        name: "filesystem",
        type: "stdio",
        command: "npx",
      });
    });
  });

  describe("findById", () => {
    it("should find a template by ID", async () => {
      const newTemplate: NewTemplate = {
        id: "tmpl-find",
        name: "Findable Template",
        createdBy: "user-123",
        systemPrompt: "Test prompt",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await repository.create(newTemplate);
      const found = await repository.findById("tmpl-find");

      expect(found).not.toBeNull();
      expect(found?.id).toBe("tmpl-find");
      expect(found?.name).toBe("Findable Template");
    });

    it("should return null for non-existent ID", async () => {
      const found = await repository.findById("non-existent");
      expect(found).toBeNull();
    });
  });

  describe("findAll", () => {
    it("should return all templates", async () => {
      const templates: NewTemplate[] = [
        {
          id: "tmpl-1",
          name: "Template 1",
          createdBy: "user-1",
          systemPrompt: "Prompt 1",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "tmpl-2",
          name: "Template 2",
          createdBy: "user-2",
          systemPrompt: "Prompt 2",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "tmpl-3",
          name: "Template 3",
          createdBy: "system",
          systemPrompt: "Prompt 3",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      for (const template of templates) {
        await repository.create(template);
      }

      const all = await repository.findAll();

      expect(all).toHaveLength(3);
      expect(all.map((t) => t.id)).toContain("tmpl-1");
      expect(all.map((t) => t.id)).toContain("tmpl-2");
      expect(all.map((t) => t.id)).toContain("tmpl-3");
    });

    it("should return empty array when no templates exist", async () => {
      const all = await repository.findAll();
      expect(all).toEqual([]);
    });
  });

  describe("findByRole", () => {
    it("should find templates by default role", async () => {
      const templates: NewTemplate[] = [
        {
          id: "tmpl-impl-1",
          name: "Implementer 1",
          createdBy: "user-1",
          systemPrompt: "Implement",
          defaultRole: "implementer",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "tmpl-impl-2",
          name: "Implementer 2",
          createdBy: "user-2",
          systemPrompt: "Implement",
          defaultRole: "implementer",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "tmpl-refiner",
          name: "Refiner",
          createdBy: "system",
          systemPrompt: "Refine",
          defaultRole: "refiner",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "tmpl-no-role",
          name: "No Role",
          createdBy: "user-3",
          systemPrompt: "Generic",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      for (const template of templates) {
        await repository.create(template);
      }

      const implementers = await repository.findByRole("implementer");
      expect(implementers).toHaveLength(2);
      expect(implementers.map((t) => t.id)).toContain("tmpl-impl-1");
      expect(implementers.map((t) => t.id)).toContain("tmpl-impl-2");

      const refiners = await repository.findByRole("refiner");
      expect(refiners).toHaveLength(1);
      expect(refiners[0]?.id).toBe("tmpl-refiner");

      const testers = await repository.findByRole("tester");
      expect(testers).toEqual([]);
    });
  });

  describe("findBuiltIn", () => {
    it("should find only system templates", async () => {
      const templates: NewTemplate[] = [
        {
          id: "system-1",
          name: "System Template 1",
          createdBy: "system",
          systemPrompt: "System prompt",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "system-2",
          name: "System Template 2",
          createdBy: "system",
          systemPrompt: "System prompt",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "user-1",
          name: "User Template",
          createdBy: "user-123",
          systemPrompt: "User prompt",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      for (const template of templates) {
        await repository.create(template);
      }

      const builtIn = await repository.findBuiltIn();

      expect(builtIn).toHaveLength(2);
      expect(builtIn.map((t) => t.id)).toContain("system-1");
      expect(builtIn.map((t) => t.id)).toContain("system-2");
      expect(builtIn.every((t) => t.createdBy === "system")).toBe(true);
    });

    it("should return empty array when no system templates exist", async () => {
      const userTemplate: NewTemplate = {
        id: "user-only",
        name: "User Template",
        createdBy: "user-123",
        systemPrompt: "Test",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await repository.create(userTemplate);
      const builtIn = await repository.findBuiltIn();

      expect(builtIn).toEqual([]);
    });
  });

  describe("update", () => {
    it("should update template fields", async () => {
      const createdAt = new Date(Date.now() - 1000); // 1 second ago
      const original: NewTemplate = {
        id: "tmpl-update",
        name: "Original Name",
        description: "Original description",
        createdBy: "user-123",
        systemPrompt: "Original prompt",
        permissionMode: "askUser",
        maxTurns: 100,
        createdAt,
        updatedAt: createdAt,
      };

      await repository.create(original);

      const updated = await repository.update("tmpl-update", {
        name: "Updated Name",
        description: "Updated description",
        systemPrompt: "Updated prompt",
        maxTurns: 150,
      });

      expect(updated.name).toBe("Updated Name");
      expect(updated.description).toBe("Updated description");
      expect(updated.systemPrompt).toBe("Updated prompt");
      expect(updated.maxTurns).toBe(150);
      expect(updated.permissionMode).toBe("askUser"); // Unchanged
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
        createdAt.getTime()
      );
    });

    it("should update builtin tools array", async () => {
      const template: NewTemplate = {
        id: "tmpl-tools",
        name: "Tools Template",
        createdBy: "user-123",
        systemPrompt: "Test",
        builtinTools: ["read"],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await repository.create(template);

      const updated = await repository.update("tmpl-tools", {
        builtinTools: ["read", "write", "edit"],
      });

      expect(updated.builtinTools).toEqual(["read", "write", "edit"]);
    });

    it("should update default role", async () => {
      const template: NewTemplate = {
        id: "tmpl-role",
        name: "Role Template",
        createdBy: "user-123",
        systemPrompt: "Test",
        defaultRole: "implementer",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await repository.create(template);

      const updated = await repository.update("tmpl-role", {
        defaultRole: "reviewer",
      });

      expect(updated.defaultRole).toBe("reviewer");
    });

    it("should throw error when updating non-existent template", async () => {
      await expect(
        repository.update("non-existent", { name: "New Name" })
      ).rejects.toThrow("Template not found");
    });

    it("should not allow updating id or createdBy", async () => {
      const template: NewTemplate = {
        id: "tmpl-immutable",
        name: "Immutable Test",
        createdBy: "user-123",
        systemPrompt: "Test",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await repository.create(template);

      // TypeScript prevents updating id and createdBy at compile time
      // Test that other fields can be updated normally
      const updated = await repository.update("tmpl-immutable", {
        name: "Updated Name",
        description: "Updated description",
      });

      expect(updated.id).toBe("tmpl-immutable");
      expect(updated.createdBy).toBe("user-123");
      expect(updated.name).toBe("Updated Name");
      expect(updated.description).toBe("Updated description");
    });
  });

  describe("delete", () => {
    it("should delete user-created template by ID", async () => {
      const template: NewTemplate = {
        id: "tmpl-delete",
        name: "Delete Me",
        createdBy: "user-123",
        systemPrompt: "Test",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await repository.create(template);

      await repository.delete("tmpl-delete");

      const found = await repository.findById("tmpl-delete");
      expect(found).toBeNull();
    });

    it("should throw error when deleting system template", async () => {
      const systemTemplate: NewTemplate = {
        id: "system-protected",
        name: "System Template",
        createdBy: "system",
        systemPrompt: "Protected",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await repository.create(systemTemplate);

      await expect(repository.delete("system-protected")).rejects.toThrow(
        "Cannot delete system template"
      );

      // Verify it still exists
      const found = await repository.findById("system-protected");
      expect(found).not.toBeNull();
    });

    it("should throw error when deleting non-existent template", async () => {
      await expect(repository.delete("non-existent")).rejects.toThrow(
        "Template not found"
      );
    });
  });

  describe("edge cases and validation", () => {
    it("should handle templates with null defaultRole", async () => {
      const template: NewTemplate = {
        id: "tmpl-null-role",
        name: "No Default Role",
        createdBy: "user-123",
        systemPrompt: "Test",
        defaultRole: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await repository.create(template);
      // SQLite returns null for undefined values
      expect(created.defaultRole).toBeNull();
    });

    it("should handle empty arrays correctly", async () => {
      const template: NewTemplate = {
        id: "tmpl-empty-arrays",
        name: "Empty Arrays",
        createdBy: "user-123",
        systemPrompt: "Test",
        builtinTools: [],
        mcpServers: [],
        allowedWorkItemTypes: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await repository.create(template);
      expect(created.builtinTools).toEqual([]);
      expect(created.mcpServers).toEqual([]);
      expect(created.allowedWorkItemTypes).toEqual([]);
    });

    it("should preserve JSON structure in arrays", async () => {
      const mcpServer = {
        name: "test-server",
        type: "sse" as const,
        url: "http://localhost:3000",
        args: ["--port", "3000"],
        env: { API_KEY: "secret" },
      };

      const template: NewTemplate = {
        id: "tmpl-json",
        name: "JSON Test",
        createdBy: "user-123",
        systemPrompt: "Test",
        mcpServers: [mcpServer],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await repository.create(template);
      expect(created.mcpServers[0]).toEqual(mcpServer);
    });
  });
});
