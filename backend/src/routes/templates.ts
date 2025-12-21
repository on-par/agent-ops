import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import type { DrizzleDatabase } from "../db/index.js";
import {
  templates,
  permissionModes,
  agentRoles,
  type Template,
  type MCPServerConfig,
} from "../db/schema.js";

// Validation schemas
const mcpServerConfigSchema = z.object({
  name: z.string().min(1, "MCP server name is required"),
  type: z.enum(["stdio", "sse", "inprocess"]),
  command: z.string().optional(),
  url: z.string().optional(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
});

const createTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  description: z.string().default(""),
  createdBy: z.string().min(1, "Created by is required"),
  systemPrompt: z.string().min(1, "System prompt is required"),
  permissionMode: z.enum(permissionModes).default("askUser"),
  maxTurns: z.number().int().min(1).max(1000).default(100),
  builtinTools: z.array(z.string()).default([]),
  mcpServers: z.array(mcpServerConfigSchema).default([]),
  allowedWorkItemTypes: z.array(z.string()).default(["*"]),
  defaultRole: z.enum(agentRoles).optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  systemPrompt: z.string().min(1).optional(),
  permissionMode: z.enum(permissionModes).optional(),
  maxTurns: z.number().int().min(1).max(1000).optional(),
  builtinTools: z.array(z.string()).optional(),
  mcpServers: z.array(mcpServerConfigSchema).optional(),
  allowedWorkItemTypes: z.array(z.string()).optional(),
  defaultRole: z.enum(agentRoles).optional(),
});

export async function templateRoutes(
  app: FastifyInstance,
  { db }: { db: DrizzleDatabase }
) {
  // GET /api/templates - List all templates
  app.get("/", async (request, reply) => {
    try {
      const allTemplates = await db.select().from(templates);

      return reply.send({
        data: allTemplates,
        count: allTemplates.length,
      });
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: "Failed to fetch templates",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // GET /api/templates/:id - Get single template
  app.get("/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const [template] = await db
        .select()
        .from(templates)
        .where(eq(templates.id, id));

      if (!template) {
        return reply.status(404).send({
          error: "Template not found",
        });
      }

      return reply.send({ data: template });
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: "Failed to fetch template",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // POST /api/templates - Create template
  app.post("/", async (request, reply) => {
    try {
      const validationResult = createTemplateSchema.safeParse(request.body);

      if (!validationResult.success) {
        return reply.status(400).send({
          error: "Invalid request body",
          details: validationResult.error.issues,
        });
      }

      const data = validationResult.data;
      const now = new Date();

      const newTemplate = {
        id: uuidv4(),
        name: data.name,
        description: data.description,
        createdBy: data.createdBy,
        systemPrompt: data.systemPrompt,
        permissionMode: data.permissionMode,
        maxTurns: data.maxTurns,
        builtinTools: data.builtinTools,
        mcpServers: data.mcpServers as MCPServerConfig[],
        allowedWorkItemTypes: data.allowedWorkItemTypes,
        defaultRole: data.defaultRole ?? null,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(templates).values(newTemplate);

      return reply.status(201).send({ data: newTemplate });
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: "Failed to create template",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // PUT /api/templates/:id - Update template
  app.put("/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const validationResult = updateTemplateSchema.safeParse(request.body);

      if (!validationResult.success) {
        return reply.status(400).send({
          error: "Invalid request body",
          details: validationResult.error.issues,
        });
      }

      const data = validationResult.data;

      // Check if template exists
      const [existingTemplate] = await db
        .select()
        .from(templates)
        .where(eq(templates.id, id));

      if (!existingTemplate) {
        return reply.status(404).send({
          error: "Template not found",
        });
      }

      const now = new Date();
      const updates = {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.systemPrompt !== undefined && { systemPrompt: data.systemPrompt }),
        ...(data.permissionMode !== undefined && { permissionMode: data.permissionMode }),
        ...(data.maxTurns !== undefined && { maxTurns: data.maxTurns }),
        ...(data.builtinTools !== undefined && { builtinTools: data.builtinTools }),
        ...(data.mcpServers !== undefined && { mcpServers: data.mcpServers as MCPServerConfig[] }),
        ...(data.allowedWorkItemTypes !== undefined && { allowedWorkItemTypes: data.allowedWorkItemTypes }),
        ...(data.defaultRole !== undefined && { defaultRole: data.defaultRole }),
        updatedAt: now,
      };

      await db.update(templates).set(updates).where(eq(templates.id, id));

      const [updatedTemplate] = await db
        .select()
        .from(templates)
        .where(eq(templates.id, id));

      return reply.send({ data: updatedTemplate });
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: "Failed to update template",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // DELETE /api/templates/:id - Delete template
  app.delete("/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      // Check if template exists
      const [existingTemplate] = await db
        .select()
        .from(templates)
        .where(eq(templates.id, id));

      if (!existingTemplate) {
        return reply.status(404).send({
          error: "Template not found",
        });
      }

      // TODO: Check if any workers are using this template and prevent deletion
      // For now, we'll allow deletion

      await db.delete(templates).where(eq(templates.id, id));

      return reply.status(204).send();
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: "Failed to delete template",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}
