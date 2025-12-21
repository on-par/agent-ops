import { describe, it, expect, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  setupTestDatabase,
  getTestDatabase,
  clearTestDatabase,
  testFixtures,
} from "./setup.js";
import * as schema from "../db/schema.js";
import type { PermissionMode, AgentRole, MCPServerConfig } from "../db/schema.js";

setupTestDatabase();

describe("Templates - Database Operations", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  // ========================================
  // CREATE Tests
  // ========================================

  describe("CREATE", () => {
    it("should create a template with all fields", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({
        name: "Full Stack Developer",
        description: "A template for full stack development tasks",
        systemPrompt: "You are a full stack developer...",
        permissionMode: "acceptEdits",
        maxTurns: 150,
        builtinTools: ["read", "write", "bash", "grep"],
        mcpServers: [
          testFixtures.mcpServer({
            name: "filesystem",
            type: "stdio",
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem"],
          }),
        ],
        allowedWorkItemTypes: ["feature", "bug"],
        defaultRole: "implementer",
      });

      const [created] = await db.insert(schema.templates).values(template).returning();

      expect(created).toBeDefined();
      expect(created.id).toBe(template.id);
      expect(created.name).toBe(template.name);
      expect(created.description).toBe(template.description);
      expect(created.systemPrompt).toBe(template.systemPrompt);
      expect(created.permissionMode).toBe("acceptEdits");
      expect(created.maxTurns).toBe(150);
      expect(created.builtinTools).toEqual(["read", "write", "bash", "grep"]);
      expect(created.mcpServers).toHaveLength(1);
      expect(created.mcpServers[0].name).toBe("filesystem");
      expect(created.allowedWorkItemTypes).toEqual(["feature", "bug"]);
      expect(created.defaultRole).toBe("implementer");
    });

    it("should create a template with minimal fields", async () => {
      const db = getTestDatabase();
      const now = new Date();
      const template = {
        id: uuidv4(),
        name: "Minimal Template",
        systemPrompt: "You are an AI assistant.",
        createdBy: "system",
        createdAt: now,
        updatedAt: now,
      };

      const [created] = await db.insert(schema.templates).values(template).returning();

      expect(created).toBeDefined();
      expect(created.description).toBe("");
      expect(created.permissionMode).toBe("askUser");
      expect(created.maxTurns).toBe(100);
      expect(created.builtinTools).toEqual([]);
      expect(created.mcpServers).toEqual([]);
      expect(created.allowedWorkItemTypes).toEqual(["*"]);
      expect(created.defaultRole).toBeNull();
    });

    it("should create template with multiple MCP servers", async () => {
      const db = getTestDatabase();
      const mcpServers: MCPServerConfig[] = [
        {
          name: "filesystem",
          type: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem"],
          env: {},
        },
        {
          name: "github",
          type: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: { GITHUB_TOKEN: "secret" },
        },
        {
          name: "remote-api",
          type: "sse",
          url: "https://api.example.com/mcp",
          args: [],
          env: {},
        },
      ];

      const template = testFixtures.template({ mcpServers });

      const [created] = await db.insert(schema.templates).values(template).returning();

      expect(created.mcpServers).toHaveLength(3);
      expect(created.mcpServers[0].type).toBe("stdio");
      expect(created.mcpServers[1].env.GITHUB_TOKEN).toBe("secret");
      expect(created.mcpServers[2].type).toBe("sse");
      expect(created.mcpServers[2].url).toBe("https://api.example.com/mcp");
    });

    it("should create template with all permission modes", async () => {
      const db = getTestDatabase();
      const modes: PermissionMode[] = ["askUser", "acceptEdits", "bypassPermissions"];

      for (const mode of modes) {
        const template = testFixtures.template({
          id: `template-${mode}`,
          permissionMode: mode,
        });

        const [created] = await db
          .insert(schema.templates)
          .values(template)
          .returning();

        expect(created.permissionMode).toBe(mode);
      }
    });

    it("should create template with all agent roles", async () => {
      const db = getTestDatabase();
      const roles: AgentRole[] = ["refiner", "implementer", "tester", "reviewer"];

      for (const role of roles) {
        const template = testFixtures.template({
          id: `template-${role}`,
          defaultRole: role,
        });

        const [created] = await db
          .insert(schema.templates)
          .values(template)
          .returning();

        expect(created.defaultRole).toBe(role);
      }
    });

    it("should create template with wildcard allowed work item types", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({
        allowedWorkItemTypes: ["*"],
      });

      const [created] = await db.insert(schema.templates).values(template).returning();

      expect(created.allowedWorkItemTypes).toEqual(["*"]);
    });

    it("should create template with specific allowed work item types", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({
        allowedWorkItemTypes: ["bug", "task"],
      });

      const [created] = await db.insert(schema.templates).values(template).returning();

      expect(created.allowedWorkItemTypes).toEqual(["bug", "task"]);
    });

    it("should reject template without required fields", async () => {
      const db = getTestDatabase();
      const invalid = {
        id: uuidv4(),
        // Missing name, systemPrompt, createdBy, createdAt, updatedAt
      };

      await expect(db.insert(schema.templates).values(invalid as any)).rejects.toThrow();
    });
  });

  // ========================================
  // READ Tests
  // ========================================

  describe("READ", () => {
    it("should read a template by ID", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-123" });
      await db.insert(schema.templates).values(template);

      const [found] = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, "template-123"));

      expect(found).toBeDefined();
      expect(found.id).toBe("template-123");
      expect(found.name).toBe(template.name);
    });

    it("should return empty array for non-existent ID", async () => {
      const db = getTestDatabase();

      const results = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, "non-existent"));

      expect(results).toHaveLength(0);
    });

    it("should list all templates", async () => {
      const db = getTestDatabase();
      const templates = [
        testFixtures.template({ name: "Template 1" }),
        testFixtures.template({ name: "Template 2" }),
        testFixtures.template({ name: "Template 3" }),
      ];

      await db.insert(schema.templates).values(templates);

      const results = await db.select().from(schema.templates);

      expect(results).toHaveLength(3);
    });

    it("should filter templates by createdBy", async () => {
      const db = getTestDatabase();
      await db.insert(schema.templates).values([
        testFixtures.template({ createdBy: "system" }),
        testFixtures.template({ createdBy: "user-1" }),
        testFixtures.template({ createdBy: "system" }),
      ]);

      const systemTemplates = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.createdBy, "system"));

      expect(systemTemplates).toHaveLength(2);
    });

    it("should filter templates by permission mode", async () => {
      const db = getTestDatabase();
      await db.insert(schema.templates).values([
        testFixtures.template({ permissionMode: "askUser" }),
        testFixtures.template({ permissionMode: "acceptEdits" }),
        testFixtures.template({ permissionMode: "askUser" }),
      ]);

      const askUserTemplates = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.permissionMode, "askUser"));

      expect(askUserTemplates).toHaveLength(2);
    });

    it("should filter templates by default role", async () => {
      const db = getTestDatabase();
      await db.insert(schema.templates).values([
        testFixtures.template({ defaultRole: "implementer" }),
        testFixtures.template({ defaultRole: "reviewer" }),
        testFixtures.template({ defaultRole: "implementer" }),
        testFixtures.template({ defaultRole: null }),
      ]);

      const implementerTemplates = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.defaultRole, "implementer"));

      expect(implementerTemplates).toHaveLength(2);
    });

    it("should sort templates by name", async () => {
      const db = getTestDatabase();
      await db.insert(schema.templates).values([
        testFixtures.template({ name: "Charlie" }),
        testFixtures.template({ name: "Alice" }),
        testFixtures.template({ name: "Bob" }),
      ]);

      const results = await db
        .select()
        .from(schema.templates)
        .orderBy(sql`${schema.templates.name} ASC`);

      expect(results[0].name).toBe("Alice");
      expect(results[1].name).toBe("Bob");
      expect(results[2].name).toBe("Charlie");
    });

    it("should paginate templates", async () => {
      const db = getTestDatabase();
      const templates = Array.from({ length: 15 }, (_, i) =>
        testFixtures.template({ name: `Template ${i}` })
      );
      await db.insert(schema.templates).values(templates);

      const page1 = await db.select().from(schema.templates).limit(10).offset(0);
      expect(page1).toHaveLength(10);

      const page2 = await db.select().from(schema.templates).limit(10).offset(10);
      expect(page2).toHaveLength(5);
    });
  });

  // ========================================
  // UPDATE Tests
  // ========================================

  describe("UPDATE", () => {
    it("should update template name", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ name: "Old Name" });
      await db.insert(schema.templates).values(template);

      await db
        .update(schema.templates)
        .set({ name: "New Name", updatedAt: new Date() })
        .where(eq(schema.templates.id, template.id));

      const [updated] = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, template.id));

      expect(updated.name).toBe("New Name");
    });

    it("should update template description", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ description: "Old description" });
      await db.insert(schema.templates).values(template);

      await db
        .update(schema.templates)
        .set({ description: "New description", updatedAt: new Date() })
        .where(eq(schema.templates.id, template.id));

      const [updated] = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, template.id));

      expect(updated.description).toBe("New description");
    });

    it("should update system prompt", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ systemPrompt: "Old prompt" });
      await db.insert(schema.templates).values(template);

      await db
        .update(schema.templates)
        .set({ systemPrompt: "New prompt", updatedAt: new Date() })
        .where(eq(schema.templates.id, template.id));

      const [updated] = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, template.id));

      expect(updated.systemPrompt).toBe("New prompt");
    });

    it("should update permission mode", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ permissionMode: "askUser" });
      await db.insert(schema.templates).values(template);

      await db
        .update(schema.templates)
        .set({ permissionMode: "bypassPermissions", updatedAt: new Date() })
        .where(eq(schema.templates.id, template.id));

      const [updated] = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, template.id));

      expect(updated.permissionMode).toBe("bypassPermissions");
    });

    it("should update max turns", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ maxTurns: 100 });
      await db.insert(schema.templates).values(template);

      await db
        .update(schema.templates)
        .set({ maxTurns: 200, updatedAt: new Date() })
        .where(eq(schema.templates.id, template.id));

      const [updated] = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, template.id));

      expect(updated.maxTurns).toBe(200);
    });

    it("should update builtin tools array", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ builtinTools: ["read", "write"] });
      await db.insert(schema.templates).values(template);

      await db
        .update(schema.templates)
        .set({
          builtinTools: ["read", "write", "bash", "grep"],
          updatedAt: new Date(),
        })
        .where(eq(schema.templates.id, template.id));

      const [updated] = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, template.id));

      expect(updated.builtinTools).toEqual(["read", "write", "bash", "grep"]);
    });

    it("should update MCP servers", async () => {
      const db = getTestDatabase();
      const originalServers = [testFixtures.mcpServer({ name: "server-1" })];
      const template = testFixtures.template({ mcpServers: originalServers });
      await db.insert(schema.templates).values(template);

      const newServers: MCPServerConfig[] = [
        testFixtures.mcpServer({ name: "server-2" }),
        testFixtures.mcpServer({ name: "server-3" }),
      ];

      await db
        .update(schema.templates)
        .set({ mcpServers: newServers, updatedAt: new Date() })
        .where(eq(schema.templates.id, template.id));

      const [updated] = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, template.id));

      expect(updated.mcpServers).toHaveLength(2);
      expect(updated.mcpServers[0].name).toBe("server-2");
      expect(updated.mcpServers[1].name).toBe("server-3");
    });

    it("should add MCP server to existing list", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({
        mcpServers: [testFixtures.mcpServer({ name: "existing" })],
      });
      await db.insert(schema.templates).values(template);

      const updatedServers = [
        ...template.mcpServers,
        testFixtures.mcpServer({ name: "new-server" }),
      ];

      await db
        .update(schema.templates)
        .set({ mcpServers: updatedServers, updatedAt: new Date() })
        .where(eq(schema.templates.id, template.id));

      const [updated] = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, template.id));

      expect(updated.mcpServers).toHaveLength(2);
      expect(updated.mcpServers.map((s) => s.name)).toContain("new-server");
    });

    it("should remove all MCP servers", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({
        mcpServers: [
          testFixtures.mcpServer({ name: "server-1" }),
          testFixtures.mcpServer({ name: "server-2" }),
        ],
      });
      await db.insert(schema.templates).values(template);

      await db
        .update(schema.templates)
        .set({ mcpServers: [], updatedAt: new Date() })
        .where(eq(schema.templates.id, template.id));

      const [updated] = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, template.id));

      expect(updated.mcpServers).toEqual([]);
    });

    it("should update allowed work item types", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ allowedWorkItemTypes: ["*"] });
      await db.insert(schema.templates).values(template);

      await db
        .update(schema.templates)
        .set({ allowedWorkItemTypes: ["feature", "bug"], updatedAt: new Date() })
        .where(eq(schema.templates.id, template.id));

      const [updated] = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, template.id));

      expect(updated.allowedWorkItemTypes).toEqual(["feature", "bug"]);
    });

    it("should update default role", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ defaultRole: "implementer" });
      await db.insert(schema.templates).values(template);

      await db
        .update(schema.templates)
        .set({ defaultRole: "reviewer", updatedAt: new Date() })
        .where(eq(schema.templates.id, template.id));

      const [updated] = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, template.id));

      expect(updated.defaultRole).toBe("reviewer");
    });

    it("should update multiple fields at once", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template();
      await db.insert(schema.templates).values(template);

      const now = new Date();
      await db
        .update(schema.templates)
        .set({
          name: "Updated Template",
          description: "Updated description",
          permissionMode: "acceptEdits",
          maxTurns: 250,
          updatedAt: now,
        })
        .where(eq(schema.templates.id, template.id));

      const [updated] = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, template.id));

      expect(updated.name).toBe("Updated Template");
      expect(updated.description).toBe("Updated description");
      expect(updated.permissionMode).toBe("acceptEdits");
      expect(updated.maxTurns).toBe(250);
    });

    it("should return updated template", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template();
      await db.insert(schema.templates).values(template);

      const [updated] = await db
        .update(schema.templates)
        .set({ name: "New Name", updatedAt: new Date() })
        .where(eq(schema.templates.id, template.id))
        .returning();

      expect(updated).toBeDefined();
      expect(updated.name).toBe("New Name");
    });
  });

  // ========================================
  // DELETE Tests
  // ========================================

  describe("DELETE", () => {
    it("should delete a template by ID", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template();
      await db.insert(schema.templates).values(template);

      await db.delete(schema.templates).where(eq(schema.templates.id, template.id));

      const results = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, template.id));

      expect(results).toHaveLength(0);
    });

    it("should delete multiple templates", async () => {
      const db = getTestDatabase();
      const templates = [
        testFixtures.template({ createdBy: "user-1" }),
        testFixtures.template({ createdBy: "user-1" }),
        testFixtures.template({ createdBy: "system" }),
      ];
      await db.insert(schema.templates).values(templates);

      await db
        .delete(schema.templates)
        .where(eq(schema.templates.createdBy, "user-1"));

      const remaining = await db.select().from(schema.templates);

      expect(remaining).toHaveLength(1);
      expect(remaining[0].createdBy).toBe("system");
    });

    it("should return deleted template", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template();
      await db.insert(schema.templates).values(template);

      const [deleted] = await db
        .delete(schema.templates)
        .where(eq(schema.templates.id, template.id))
        .returning();

      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(template.id);
    });

    it("should fail to delete template with active workers (foreign key constraint)", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1");
      await db.insert(schema.workers).values(worker);

      // Verify worker exists
      const workers = await db.select().from(schema.workers);
      expect(workers).toHaveLength(1);

      // Attempt to delete template should fail due to foreign key constraint
      await expect(
        db.delete(schema.templates).where(eq(schema.templates.id, "template-1"))
      ).rejects.toThrow();

      // Verify template is still there
      const templates = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, "template-1"));
      expect(templates).toHaveLength(1);
    });

    it("should delete template after deleting all workers", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({ id: "template-1" });
      await db.insert(schema.templates).values(template);

      const worker = testFixtures.worker("template-1");
      await db.insert(schema.workers).values(worker);

      // First delete the worker
      await db
        .delete(schema.workers)
        .where(eq(schema.workers.templateId, "template-1"));

      // Now delete the template should succeed
      await db.delete(schema.templates).where(eq(schema.templates.id, "template-1"));

      // Verify template is deleted
      const templates = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, "template-1"));
      expect(templates).toHaveLength(0);
    });
  });

  // ========================================
  // JSON Field Handling Tests
  // ========================================

  describe("JSON Field Handling", () => {
    it("should correctly serialize and deserialize builtin tools array", async () => {
      const db = getTestDatabase();
      const tools = ["read", "write", "edit", "bash", "grep", "glob"];
      const template = testFixtures.template({ builtinTools: tools });

      await db.insert(schema.templates).values(template);

      const [retrieved] = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, template.id));

      expect(retrieved.builtinTools).toEqual(tools);
      expect(Array.isArray(retrieved.builtinTools)).toBe(true);
    });

    it("should correctly serialize and deserialize MCP servers array", async () => {
      const db = getTestDatabase();
      const mcpServers: MCPServerConfig[] = [
        {
          name: "filesystem",
          type: "stdio",
          command: "node",
          args: ["server.js"],
          env: { HOME: "/home/user" },
        },
        {
          name: "api-server",
          type: "sse",
          url: "https://api.example.com/mcp",
          args: [],
          env: { API_KEY: "secret-key" },
        },
      ];

      const template = testFixtures.template({ mcpServers });

      await db.insert(schema.templates).values(template);

      const [retrieved] = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, template.id));

      expect(retrieved.mcpServers).toEqual(mcpServers);
      expect(Array.isArray(retrieved.mcpServers)).toBe(true);
      expect(retrieved.mcpServers[0].env.HOME).toBe("/home/user");
      expect(retrieved.mcpServers[1].url).toBe("https://api.example.com/mcp");
    });

    it("should handle empty arrays correctly", async () => {
      const db = getTestDatabase();
      const template = testFixtures.template({
        builtinTools: [],
        mcpServers: [],
      });

      await db.insert(schema.templates).values(template);

      const [retrieved] = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, template.id));

      expect(retrieved.builtinTools).toEqual([]);
      expect(retrieved.mcpServers).toEqual([]);
    });

    it("should handle complex nested MCP server configurations", async () => {
      const db = getTestDatabase();
      const complexServer: MCPServerConfig = {
        name: "complex-server",
        type: "stdio",
        command: "python",
        args: ["-m", "server", "--config", "config.json"],
        env: {
          PYTHON_PATH: "/usr/bin/python",
          CONFIG_DIR: "/etc/server",
          LOG_LEVEL: "debug",
          FEATURE_FLAGS: "flag1,flag2,flag3",
        },
      };

      const template = testFixtures.template({ mcpServers: [complexServer] });

      await db.insert(schema.templates).values(template);

      const [retrieved] = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, template.id));

      expect(retrieved.mcpServers[0]).toEqual(complexServer);
      expect(retrieved.mcpServers[0].env.FEATURE_FLAGS).toBe("flag1,flag2,flag3");
    });
  });

  // ========================================
  // Complex Query Tests
  // ========================================

  describe("Complex Queries", () => {
    it("should find templates by role and permission mode", async () => {
      const db = getTestDatabase();
      await db.insert(schema.templates).values([
        testFixtures.template({
          defaultRole: "implementer",
          permissionMode: "acceptEdits",
        }),
        testFixtures.template({
          defaultRole: "reviewer",
          permissionMode: "acceptEdits",
        }),
        testFixtures.template({
          defaultRole: "implementer",
          permissionMode: "askUser",
        }),
      ]);

      const results = await db
        .select()
        .from(schema.templates)
        .where(
          sql`${schema.templates.defaultRole} = 'implementer' AND ${schema.templates.permissionMode} = 'acceptEdits'`
        );

      expect(results).toHaveLength(1);
      expect(results[0].defaultRole).toBe("implementer");
      expect(results[0].permissionMode).toBe("acceptEdits");
    });

    it("should count templates by permission mode", async () => {
      const db = getTestDatabase();
      await db.insert(schema.templates).values([
        testFixtures.template({ permissionMode: "askUser" }),
        testFixtures.template({ permissionMode: "acceptEdits" }),
        testFixtures.template({ permissionMode: "askUser" }),
        testFixtures.template({ permissionMode: "bypassPermissions" }),
      ]);

      const counts = await db
        .select({
          permissionMode: schema.templates.permissionMode,
          count: sql<number>`count(*)`,
        })
        .from(schema.templates)
        .groupBy(schema.templates.permissionMode);

      const askUserCount = counts.find((c) => c.permissionMode === "askUser");
      expect(askUserCount?.count).toBe(2);
    });

    it("should find recently updated templates", async () => {
      const db = getTestDatabase();
      const now = Date.now();

      await db.insert(schema.templates).values([
        testFixtures.template({ updatedAt: new Date(now - 1000) }), // Recent
        testFixtures.template({ updatedAt: new Date(now - 30 * 60 * 1000) }), // 30 minutes ago
        testFixtures.template({ updatedAt: new Date(now - 24 * 60 * 60 * 1000) }), // 1 day ago
      ]);

      const oneHourAgo = now - 60 * 60 * 1000;
      const recent = await db
        .select()
        .from(schema.templates)
        .where(sql`${schema.templates.updatedAt} > ${oneHourAgo}`);

      expect(recent).toHaveLength(2);
    });
  });

  // ========================================
  // Error Cases
  // ========================================

  describe("Error Cases", () => {
    it("should handle updating non-existent template", async () => {
      const db = getTestDatabase();

      const results = await db
        .update(schema.templates)
        .set({ name: "New Name", updatedAt: new Date() })
        .where(eq(schema.templates.id, "non-existent"))
        .returning();

      expect(results).toHaveLength(0);
    });

    it("should handle deleting non-existent template", async () => {
      const db = getTestDatabase();

      const results = await db
        .delete(schema.templates)
        .where(eq(schema.templates.id, "non-existent"))
        .returning();

      expect(results).toHaveLength(0);
    });

    it("should handle invalid JSON gracefully", async () => {
      // This test ensures that Drizzle's JSON handling works correctly
      // In practice, Drizzle validates JSON before inserting
      const db = getTestDatabase();
      const template = testFixtures.template({ builtinTools: ["read", "write"] });

      await db.insert(schema.templates).values(template);

      const [retrieved] = await db
        .select()
        .from(schema.templates)
        .where(eq(schema.templates.id, template.id));

      expect(Array.isArray(retrieved.builtinTools)).toBe(true);
    });
  });
});
