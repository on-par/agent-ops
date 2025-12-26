import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../../shared/db/schema.js";
import { templatesHandler } from "../handler/templates.handler.js";
import { TemplateRepository } from "../repositories/template.repository.js";
import { TemplateRegistryService } from "../services/template-registry.service.js";
import type { CreateAgentTemplate } from "../models/template.js";
import { v4 as uuidv4 } from "uuid";

describe("TemplatesHandler", () => {
  let app: FastifyInstance;
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let templateService: TemplateRegistryService;

  // Helper to create valid template data
  const createTemplateData = (
    overrides: Partial<CreateAgentTemplate> = {}
  ): CreateAgentTemplate => ({
    name: `Test Template ${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdBy: "test-user",
    systemPrompt: "This is a valid system prompt with at least 20 characters.",
    ...overrides,
  });

  beforeEach(async () => {
    // Create in-memory database
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    db = drizzle(sqlite, { schema });

    // Create templates table
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
      )
    `);

    // Initialize service
    const repository = new TemplateRepository(db);
    templateService = new TemplateRegistryService(repository);

    // Initialize built-in templates
    await templateService.initializeBuiltIns();

    // Initialize Fastify app with plugin
    app = Fastify();
    await app.register(templatesHandler, {
      prefix: "/api/templates",
      templateService,
    });
  });

  afterEach(async () => {
    await app.close();
    sqlite.close();
  });

  // Phase 2: CRUD Endpoint Tests
  describe("GET /api/templates", () => {
    it("returns empty array when no user templates exist", async () => {
      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/templates",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      // Should have at least the built-in templates
      expect(body.length).toBeGreaterThanOrEqual(4);
    });

    it("returns array of templates when templates exist", async () => {
      // Arrange: Create a template
      const newTemplate = createTemplateData({ name: "Test Template 1" });
      await templateService.register(newTemplate);

      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/templates",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(4); // Built-ins + our template
      expect(body.some((t: any) => t.name === "Test Template 1")).toBe(true);
    });

    it("returns templates with correct structure", async () => {
      // Arrange
      const newTemplate = createTemplateData({ name: "Structured Template" });
      await templateService.register(newTemplate);

      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/templates",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      const template = body.find((t: any) => t.name === "Structured Template");
      expect(template).toBeDefined();
      expect(template).toHaveProperty("id");
      expect(template).toHaveProperty("name");
      expect(template).toHaveProperty("createdBy");
      expect(template).toHaveProperty("systemPrompt");
      expect(template).toHaveProperty("createdAt");
      expect(template).toHaveProperty("updatedAt");
    });
  });

  describe("POST /api/templates", () => {
    it("creates template with valid minimal data", async () => {
      // Arrange
      const newTemplate = createTemplateData({ name: "Minimal Template" });

      // Act
      const response = await app.inject({
        method: "POST",
        url: "/api/templates",
        payload: newTemplate,
      });

      // Assert
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.name).toBe("Minimal Template");
      expect(body.id).toBeDefined();
      expect(body.createdBy).toBe("test-user");
      expect(body.systemPrompt).toBe(newTemplate.systemPrompt);
    });

    it("creates template with full data including MCP servers", async () => {
      // Arrange
      const newTemplate = createTemplateData({
        name: "Full Template",
        description: "A full template with all fields",
        permissionMode: "acceptEdits",
        maxTurns: 200,
        builtinTools: ["read", "write", "bash"],
        mcpServers: [
          {
            name: "test-server",
            type: "stdio",
            command: "/usr/bin/test",
            args: ["--flag"],
            env: { KEY: "value" },
          },
        ],
        allowedWorkItemTypes: ["feature", "bug"],
        defaultRole: "implementer",
      });

      // Act
      const response = await app.inject({
        method: "POST",
        url: "/api/templates",
        payload: newTemplate,
      });

      // Assert
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.name).toBe("Full Template");
      expect(body.description).toBe("A full template with all fields");
      expect(body.permissionMode).toBe("acceptEdits");
      expect(body.maxTurns).toBe(200);
      expect(body.builtinTools).toContain("read");
      expect(body.mcpServers).toHaveLength(1);
      expect(body.mcpServers[0].name).toBe("test-server");
      expect(body.allowedWorkItemTypes).toEqual(["feature", "bug"]);
      expect(body.defaultRole).toBe("implementer");
    });

    it("returns 400 for missing required fields", async () => {
      // Arrange: Missing createdBy
      const invalidTemplate = {
        name: "Invalid Template",
        systemPrompt: "This is a valid system prompt with at least 20 characters.",
      };

      // Act
      const response = await app.inject({
        method: "POST",
        url: "/api/templates",
        payload: invalidTemplate,
      });

      // Assert
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Validation failed");
      expect(body.statusCode).toBe(400);
      expect(body.details).toBeDefined();
    });

    it("handles systemPrompt validation", async () => {
      // Arrange
      const validTemplate = createTemplateData({
        name: "Valid Prompt Template",
        systemPrompt: "This is a valid system prompt with at least 20 characters.",
      });

      // Act
      const response = await app.inject({
        method: "POST",
        url: "/api/templates",
        payload: validTemplate,
      });

      // Assert
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.systemPrompt).toBeDefined();
    });

    it("returns 409 for duplicate template name", async () => {
      // Arrange
      const template1 = createTemplateData({ name: "Duplicate Name" });
      await templateService.register(template1);

      const template2 = createTemplateData({ name: "Duplicate Name" });

      // Act
      const response = await app.inject({
        method: "POST",
        url: "/api/templates",
        payload: template2,
      });

      // Assert
      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("already exists");
      expect(body.statusCode).toBe(409);
    });

    it("handles case-insensitive duplicate name detection", async () => {
      // Arrange
      const template1 = createTemplateData({ name: "Unique Name" });
      await templateService.register(template1);

      const template2 = createTemplateData({ name: "unique name" });

      // Act
      const response = await app.inject({
        method: "POST",
        url: "/api/templates",
        payload: template2,
      });

      // Assert
      expect(response.statusCode).toBe(409);
    });
  });

  describe("GET /api/templates/:templateId", () => {
    it("returns template for valid ID", async () => {
      // Arrange
      const newTemplate = createTemplateData({ name: "Specific Template" });
      const created = await templateService.register(newTemplate);

      // Act
      const response = await app.inject({
        method: "GET",
        url: `/api/templates/${created.id}`,
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(created.id);
      expect(body.name).toBe("Specific Template");
    });

    it("returns 404 for non-existent template ID", async () => {
      // Act
      const response = await app.inject({
        method: "GET",
        url: `/api/templates/non-existent-id-${uuidv4()}`,
      });

      // Assert
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("not found");
      expect(body.statusCode).toBe(404);
    });
  });

  describe("DELETE /api/templates/:templateId", () => {
    it("deletes user-defined template successfully", async () => {
      // Arrange
      const newTemplate = createTemplateData({ name: "To Delete" });
      const created = await templateService.register(newTemplate);

      // Act
      const response = await app.inject({
        method: "DELETE",
        url: `/api/templates/${created.id}`,
      });

      // Assert
      expect(response.statusCode).toBe(204);
      expect(response.body).toBe("");

      // Verify it's deleted
      const checkResponse = await app.inject({
        method: "GET",
        url: `/api/templates/${created.id}`,
      });
      expect(checkResponse.statusCode).toBe(404);
    });

    it("returns 404 for non-existent template", async () => {
      // Act
      const response = await app.inject({
        method: "DELETE",
        url: `/api/templates/non-existent-id-${uuidv4()}`,
      });

      // Assert
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("not found");
    });

    it("returns 409 when attempting to delete system template", async () => {
      // Arrange: Get a built-in template ID
      const allTemplates = await templateService.getAll();
      const builtIn = allTemplates.find((t) => t.createdBy === "system");
      expect(builtIn).toBeDefined();

      // Act
      const response = await app.inject({
        method: "DELETE",
        url: `/api/templates/${builtIn!.id}`,
      });

      // Assert
      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("Cannot delete system template");
      expect(body.statusCode).toBe(409);
    });
  });

  // Phase 3: Update and Clone Endpoint Tests
  describe("PATCH /api/templates/:templateId", () => {
    it("updates template fields successfully", async () => {
      // Arrange
      const newTemplate = createTemplateData({ name: "Original Name" });
      const created = await templateService.register(newTemplate);

      // Act
      const response = await app.inject({
        method: "PATCH",
        url: `/api/templates/${created.id}`,
        payload: {
          name: "Updated Name",
          description: "Updated description",
        },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.name).toBe("Updated Name");
      expect(body.description).toBe("Updated description");
    });

    it("performs partial update (only changing one field)", async () => {
      // Arrange
      const newTemplate = createTemplateData({ name: "Partial Update Test" });
      const created = await templateService.register(newTemplate);
      const originalDescription = created.description;

      // Act
      const response = await app.inject({
        method: "PATCH",
        url: `/api/templates/${created.id}`,
        payload: {
          maxTurns: 250,
        },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.maxTurns).toBe(250);
      expect(body.name).toBe("Partial Update Test");
      expect(body.description).toBe(originalDescription);
    });

    it("returns 404 for non-existent template", async () => {
      // Act
      const response = await app.inject({
        method: "PATCH",
        url: `/api/templates/non-existent-id-${uuidv4()}`,
        payload: { name: "New Name" },
      });

      // Assert
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("not found");
    });

    it("returns 400 for invalid update data", async () => {
      // Arrange
      const newTemplate = createTemplateData({ name: "Invalid Update Test" });
      const created = await templateService.register(newTemplate);

      // Act
      const response = await app.inject({
        method: "PATCH",
        url: `/api/templates/${created.id}`,
        payload: {
          maxTurns: "not a number",
        },
      });

      // Assert
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Validation failed");
    });

    it("returns 409 when updating name to existing template name", async () => {
      // Arrange
      const template1 = createTemplateData({ name: "Template One" });
      const template2 = createTemplateData({ name: "Template Two" });
      const created1 = await templateService.register(template1);
      await templateService.register(template2);

      // Act
      const response = await app.inject({
        method: "PATCH",
        url: `/api/templates/${created1.id}`,
        payload: { name: "Template Two" },
      });

      // Assert
      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("already exists");
    });
  });

  describe("POST /api/templates/:templateId/clone", () => {
    it("clones template with new name and creator", async () => {
      // Arrange
      const original = createTemplateData({ name: "Original to Clone" });
      const created = await templateService.register(original);

      // Act
      const response = await app.inject({
        method: "POST",
        url: `/api/templates/${created.id}/clone`,
        payload: {
          newName: "Cloned Template",
          createdBy: "different-user",
        },
      });

      // Assert
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.name).toBe("Cloned Template");
      expect(body.createdBy).toBe("different-user");
      expect(body.id).not.toBe(created.id);
    });

    it("cloned template has new ID but copied configuration", async () => {
      // Arrange
      const original = createTemplateData({
        name: "Original Config",
        permissionMode: "acceptEdits",
        maxTurns: 150,
        defaultRole: "implementer",
      });
      const created = await templateService.register(original);

      // Act
      const response = await app.inject({
        method: "POST",
        url: `/api/templates/${created.id}/clone`,
        payload: {
          newName: "Cloned Config",
          createdBy: "new-creator",
        },
      });

      // Assert
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.id).not.toBe(created.id);
      expect(body.permissionMode).toBe("acceptEdits");
      expect(body.maxTurns).toBe(150);
      expect(body.defaultRole).toBe("implementer");
    });

    it("returns 404 for non-existent source template", async () => {
      // Act
      const response = await app.inject({
        method: "POST",
        url: `/api/templates/non-existent-id-${uuidv4()}/clone`,
        payload: {
          newName: "Cloned",
          createdBy: "user",
        },
      });

      // Assert
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("not found");
    });

    it("returns 400 for missing required clone fields", async () => {
      // Arrange
      const original = createTemplateData({ name: "Original for Clone" });
      const created = await templateService.register(original);

      // Act
      const response = await app.inject({
        method: "POST",
        url: `/api/templates/${created.id}/clone`,
        payload: {
          newName: "Cloned",
          // Missing createdBy
        },
      });

      // Assert
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("Validation failed");
    });

    it("returns 409 for clone name matching existing template", async () => {
      // Arrange
      const original = createTemplateData({ name: "Original" });
      const existing = createTemplateData({ name: "Existing Name" });
      const createdOriginal = await templateService.register(original);
      await templateService.register(existing);

      // Act
      const response = await app.inject({
        method: "POST",
        url: `/api/templates/${createdOriginal.id}/clone`,
        payload: {
          newName: "Existing Name",
          createdBy: "user",
        },
      });

      // Assert
      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("already exists");
    });
  });

  // Phase 4: Query Endpoint Tests
  describe("GET /api/templates/builtin", () => {
    it("returns only templates with createdBy: system", async () => {
      // Arrange: Create a user template
      const userTemplate = createTemplateData({ name: "User Template" });
      await templateService.register(userTemplate);

      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/templates/builtin",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(4);
      expect(body.every((t: any) => t.createdBy === "system")).toBe(true);
      expect(body.some((t: any) => t.name === "User Template")).toBe(false);
    });
  });

  describe("GET /api/templates/user-defined", () => {
    it("returns templates for specified userId", async () => {
      // Arrange
      const userTemplate1 = createTemplateData({
        name: "User A Template 1",
        createdBy: "user-a",
      });
      const userTemplate2 = createTemplateData({
        name: "User A Template 2",
        createdBy: "user-a",
      });
      const otherTemplate = createTemplateData({
        name: "User B Template",
        createdBy: "user-b",
      });
      await templateService.register(userTemplate1);
      await templateService.register(userTemplate2);
      await templateService.register(otherTemplate);

      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/templates/user-defined?userId=user-a",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.length).toBe(2);
      expect(body.every((t: any) => t.createdBy === "user-a")).toBe(true);
      expect(body.some((t: any) => t.name === "User A Template 1")).toBe(true);
      expect(body.some((t: any) => t.name === "User B Template")).toBe(false);
    });

    it("returns 400 when userId query param is missing", async () => {
      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/templates/user-defined",
      });

      // Assert
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("userId");
    });

    it("returns empty array for user with no templates", async () => {
      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/templates/user-defined?userId=non-existent-user",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toEqual([]);
    });

    it("excludes system templates from user-defined", async () => {
      // Arrange
      const userTemplate = createTemplateData({ createdBy: "user-c" });
      await templateService.register(userTemplate);

      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/templates/user-defined?userId=user-c",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.every((t: any) => t.createdBy !== "system")).toBe(true);
    });
  });

  describe("GET /api/templates/by-role", () => {
    it("returns templates with matching defaultRole", async () => {
      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/templates/by-role?role=refiner",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      expect(body.every((t: any) => t.defaultRole === "refiner")).toBe(true);
    });

    it("returns 400 when role query param is missing", async () => {
      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/templates/by-role",
      });

      // Assert
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("role");
    });

    it("returns empty array when no templates match role", async () => {
      // Arrange: All built-in templates have roles, but let's create one without
      const noRoleTemplate = createTemplateData({
        name: "No Role Template",
      });
      await templateService.register(noRoleTemplate);

      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/templates/by-role?role=tester",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.every((t: any) => t.defaultRole === "tester")).toBe(true);
    });

    it("works with valid roles: refiner, implementer, tester, reviewer", async () => {
      // Act & Assert for each role
      const roles = ["refiner", "implementer", "tester", "reviewer"];
      for (const role of roles) {
        const response = await app.inject({
          method: "GET",
          url: `/api/templates/by-role?role=${role}`,
        });
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(Array.isArray(body)).toBe(true);
      }
    });
  });

  describe("GET /api/templates/for-work-item-type", () => {
    it("returns templates with matching allowedWorkItemTypes", async () => {
      // Arrange: Create template with specific work item types
      const specificTemplate = createTemplateData({
        name: "Feature Only",
        allowedWorkItemTypes: ["feature"],
      });
      await templateService.register(specificTemplate);

      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/templates/for-work-item-type?type=feature",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.length).toBeGreaterThan(0);
      expect(
        body.every((t: any) =>
          t.allowedWorkItemTypes.includes("*") ||
          t.allowedWorkItemTypes.includes("feature")
        )
      ).toBe(true);
    });

    it("returns 400 when type query param is missing", async () => {
      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/templates/for-work-item-type",
      });

      // Assert
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("type");
    });

    it("returns templates with wildcard wildcard allowedWorkItemTypes for any type", async () => {
      // Arrange: Verify built-ins have wildcard
      const allTemplates = await templateService.getAll();
      const wildcardTemplates = allTemplates.filter((t) =>
        t.allowedWorkItemTypes.includes("*")
      );

      // Act
      const response = await app.inject({
        method: "GET",
        url: "/api/templates/for-work-item-type?type=task",
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.length).toBeGreaterThanOrEqual(wildcardTemplates.length);
    });

    it("works with valid types: feature, bug, task, research", async () => {
      // Act & Assert for each type
      const types = ["feature", "bug", "task", "research"];
      for (const type of types) {
        const response = await app.inject({
          method: "GET",
          url: `/api/templates/for-work-item-type?type=${type}`,
        });
        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(Array.isArray(body)).toBe(true);
      }
    });
  });

  // Phase 5: Error Handling and Edge Cases
  describe("Error Response Format Consistency", () => {
    it("400 errors include error, statusCode, and details for validation errors", async () => {
      // Act
      const response = await app.inject({
        method: "POST",
        url: "/api/templates",
        payload: {
          name: "Missing Fields",
        },
      });

      // Assert
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("error");
      expect(body).toHaveProperty("statusCode", 400);
      expect(body).toHaveProperty("details");
      expect(Array.isArray(body.details)).toBe(true);
    });

    it("404 errors include error and statusCode fields", async () => {
      // Act
      const response = await app.inject({
        method: "GET",
        url: `/api/templates/non-existent-${uuidv4()}`,
      });

      // Assert
      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("error");
      expect(body).toHaveProperty("statusCode", 404);
    });

    it("409 errors include error and statusCode fields", async () => {
      // Arrange
      const template = createTemplateData({ name: "Conflict Test" });
      await templateService.register(template);

      // Act
      const response = await app.inject({
        method: "POST",
        url: "/api/templates",
        payload: createTemplateData({ name: "Conflict Test" }),
      });

      // Assert
      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("error");
      expect(body).toHaveProperty("statusCode", 409);
    });
  });

  describe("Edge Cases", () => {
    it("handles template with maximum allowed maxTurns (1000)", async () => {
      // Arrange
      const maxTurnsTemplate = createTemplateData({
        name: "Max Turns Template",
        maxTurns: 1000,
      });

      // Act
      const response = await app.inject({
        method: "POST",
        url: "/api/templates",
        payload: maxTurnsTemplate,
      });

      // Assert
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.maxTurns).toBe(1000);
    });

    it("handles template with all permission modes", async () => {
      // Arrange
      const modes = ["askUser", "acceptEdits", "bypassPermissions"];
      for (const mode of modes) {
        const template = createTemplateData({
          name: `Permission Mode ${mode}`,
          permissionMode: mode as any,
        });

        // Act
        const response = await app.inject({
          method: "POST",
          url: "/api/templates",
          payload: template,
        });

        // Assert
        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.body);
        expect(body.permissionMode).toBe(mode);
      }
    });

    it("handles template with complex MCP server configurations", async () => {
      // Arrange
      const complexTemplate = createTemplateData({
        name: "Complex MCP",
        mcpServers: [
          {
            name: "stdio-server",
            type: "stdio",
            command: "/usr/bin/stdio-server",
            args: ["--debug", "--port=3000"],
            env: { LOG_LEVEL: "debug" },
          },
          {
            name: "sse-server",
            type: "sse",
            url: "http://localhost:8080/mcp",
            env: { API_KEY: "secret" },
          },
        ],
      });

      // Act
      const response = await app.inject({
        method: "POST",
        url: "/api/templates",
        payload: complexTemplate,
      });

      // Assert
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.mcpServers).toHaveLength(2);
      expect(body.mcpServers[0].type).toBe("stdio");
      expect(body.mcpServers[1].type).toBe("sse");
    });

    it("handles template with all work item types specified", async () => {
      // Arrange
      const allTypesTemplate = createTemplateData({
        name: "All Types Template",
        allowedWorkItemTypes: ["feature", "bug", "task", "research"],
      });

      // Act
      const response = await app.inject({
        method: "POST",
        url: "/api/templates",
        payload: allTypesTemplate,
      });

      // Assert
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.allowedWorkItemTypes).toEqual([
        "feature",
        "bug",
        "task",
        "research",
      ]);
    });

    it("validates MCP server configuration with proper types", async () => {
      // Arrange - Valid MCP server configurations
      const validMcp = createTemplateData({
        name: "Valid MCP Config",
        mcpServers: [
          {
            name: "valid-stdio",
            type: "stdio",
            command: "/usr/bin/server",
          },
          {
            name: "valid-sse",
            type: "sse",
            url: "http://localhost:8000/mcp",
          },
        ],
      });

      // Act
      const response = await app.inject({
        method: "POST",
        url: "/api/templates",
        payload: validMcp,
      });

      // Assert
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.mcpServers).toHaveLength(2);
    });

    it("handles multiple MCP servers with different names", async () => {
      // Arrange - Multiple MCP servers with unique names
      const multipleMcp = createTemplateData({
        name: "Multiple MCP Names",
        mcpServers: [
          {
            name: "stdio-server",
            type: "stdio",
            command: "/usr/bin/server1",
          },
          {
            name: "sse-server",
            type: "sse",
            url: "http://localhost:8000",
          },
        ],
      });

      // Act
      const response = await app.inject({
        method: "POST",
        url: "/api/templates",
        payload: multipleMcp,
      });

      // Assert
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.mcpServers).toHaveLength(2);
      expect(body.mcpServers[0].name).toBe("stdio-server");
      expect(body.mcpServers[1].name).toBe("sse-server");
    });
  });
});
