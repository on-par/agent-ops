import type { FastifyInstance, FastifyPluginOptions, FastifyReply } from "fastify";
import { z, ZodError } from "zod";
import type { TemplateRegistryService } from "../services/template-registry.service.js";
import type { WorkItemType } from "../../../shared/db/schema.js";
import {
  CreateTemplateSchema,
  UpdateTemplateSchema,
  CloneTemplateSchema,
  TemplateIdParamsSchema,
  RoleQuerySchema,
  WorkItemTypeQuerySchema,
  UserIdQuerySchema,
} from "../schemas/template.schemas.js";

export interface TemplatesHandlerOptions extends FastifyPluginOptions {
  templateService: TemplateRegistryService;
}

/**
 * Templates REST Handler
 * Provides CRUD and registry operations for agent templates
 */
export async function templatesHandler(
  app: FastifyInstance,
  options: TemplatesHandlerOptions
): Promise<void> {
  const { templateService } = options;

  // Error handler helper
  const handleError = (
    error: unknown,
    reply: FastifyReply
  ): void => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: "Validation failed",
        details: error.issues.map((e: z.ZodIssue) => ({
          path: e.path,
          message: e.message,
        })),
        statusCode: 400,
      });
      return;
    }

    if (error instanceof Error) {
      const message = error.message;

      if (message.includes("not found")) {
        reply.status(404).send({
          error: message,
          statusCode: 404,
        });
        return;
      }

      if (message.includes("Cannot delete system template")) {
        reply.status(409).send({
          error: message,
          statusCode: 409,
        });
        return;
      }

      if (message.includes("already exists")) {
        reply.status(409).send({
          error: message,
          statusCode: 409,
        });
        return;
      }
    }

    // Unknown error - rethrow
    throw error;
  };

  // GET /templates - Get all templates
  app.get("/", async (request, reply) => {
    try {
      const templates = await templateService.getAll();
      return templates;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // POST /templates - Register new template
  app.post("/", async (request, reply) => {
    try {
      const parsed = CreateTemplateSchema.parse(request.body);
      const template = await templateService.register(parsed);
      reply.status(201);
      return template;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // GET /templates/builtin - Get system templates
  app.get("/builtin", async (request, reply) => {
    try {
      const templates = await templateService.getBuiltIn();
      return templates;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // GET /templates/user-defined - Get user templates
  app.get("/user-defined", async (request, reply) => {
    try {
      const { userId } = UserIdQuerySchema.parse(request.query);
      if (!userId) {
        reply.status(400).send({
          error: "userId query parameter is required",
          statusCode: 400,
        });
        return;
      }
      const templates = await templateService.getUserDefined(userId);
      return templates;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // GET /templates/by-role - Get templates by role
  app.get("/by-role", async (request, reply) => {
    try {
      const { role } = RoleQuerySchema.parse(request.query);
      if (!role) {
        reply.status(400).send({
          error: "role query parameter is required",
          statusCode: 400,
        });
        return;
      }
      const templates = await templateService.findByRole(role);
      return templates;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // GET /templates/for-work-item-type - Get templates for work item type
  app.get("/for-work-item-type", async (request, reply) => {
    try {
      const { type } = WorkItemTypeQuerySchema.parse(request.query);
      if (!type) {
        reply.status(400).send({
          error: "type query parameter is required",
          statusCode: 400,
        });
        return;
      }
      const templates = await templateService.findForWorkItemType(type as WorkItemType);
      return templates;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // GET /templates/:templateId - Get template by ID
  app.get("/:templateId", async (request, reply) => {
    try {
      const { templateId } = TemplateIdParamsSchema.parse(request.params);
      const template = await templateService.getById(templateId);
      if (!template) {
        reply.status(404).send({
          error: "Template not found",
          statusCode: 404,
        });
        return;
      }
      return template;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // PATCH /templates/:templateId - Update template
  app.patch("/:templateId", async (request, reply) => {
    try {
      const { templateId } = TemplateIdParamsSchema.parse(request.params);
      const updates = UpdateTemplateSchema.parse(request.body);
      const template = await templateService.update(templateId, updates);
      return template;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // DELETE /templates/:templateId - Unregister template
  app.delete("/:templateId", async (request, reply) => {
    try {
      const { templateId } = TemplateIdParamsSchema.parse(request.params);
      await templateService.unregister(templateId);
      reply.status(204).send();
    } catch (error) {
      handleError(error, reply);
    }
  });

  // POST /templates/:templateId/clone - Clone template
  app.post("/:templateId/clone", async (request, reply) => {
    try {
      const { templateId } = TemplateIdParamsSchema.parse(request.params);
      const { newName, createdBy } = CloneTemplateSchema.parse(request.body);
      const template = await templateService.clone(templateId, newName, createdBy);
      reply.status(201);
      return template;
    } catch (error) {
      handleError(error, reply);
    }
  });
}
