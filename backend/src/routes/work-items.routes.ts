import type { FastifyInstance, FastifyPluginOptions, FastifyReply } from "fastify";
import { z, ZodError } from "zod";
import type { WorkItemService } from "../services/work-item.service.js";
import {
  WorkItemStatusSchema,
  WorkItemTypeSchema,
} from "../models/work-item.js";
import { agentRoles, type AgentRole } from "../db/schema.js";

export interface WorkItemRoutesOptions extends FastifyPluginOptions {
  service: WorkItemService;
}

// Request validation schemas
const CreateWorkItemSchema = z.object({
  title: z.string().min(1),
  type: WorkItemTypeSchema,
  description: z.string().optional(),
  createdBy: z.string().min(1),
  parentId: z.string().optional(),
  successCriteria: z
    .array(z.object({ description: z.string().min(1) }))
    .optional(),
  linkedFiles: z.array(z.string()).optional(),
  status: WorkItemStatusSchema.optional(),
});

const UpdateWorkItemSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  linkedFiles: z.array(z.string()).optional(),
  successCriteria: z
    .array(
      z.object({
        id: z.string(),
        description: z.string(),
        completed: z.boolean(),
        verifiedBy: z.string().optional(),
        verifiedAt: z.number().optional(),
      })
    )
    .optional(),
  requiresApproval: z.record(z.string(), z.boolean()).optional(),
});

const TransitionSchema = z.object({
  status: WorkItemStatusSchema,
});

const AgentRoleSchema = z.enum(agentRoles as unknown as readonly [string, ...string[]]);

const AssignAgentSchema = z.object({
  role: AgentRoleSchema,
  agentId: z.string().min(1),
});

const SuccessCriterionSchema = z.object({
  description: z.string().min(1),
  completed: z.boolean().optional(),
});

const QueryParamsSchema = z.object({
  status: WorkItemStatusSchema.optional(),
  type: WorkItemTypeSchema.optional(),
});

/**
 * Work Items REST Routes
 * Provides CRUD and workflow operations for work items
 */
export async function workItemsRoutes(
  app: FastifyInstance,
  options: WorkItemRoutesOptions
): Promise<void> {
  const { service } = options;

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

      if (message.includes("Invalid status transition")) {
        reply.status(409).send({
          error: message,
          statusCode: 409,
        });
        return;
      }

      if (message.includes("requires approval")) {
        reply.status(409).send({
          error: message,
          statusCode: 409,
        });
        return;
      }

      if (
        message.includes("has") &&
        message.includes("child") &&
        message.includes("Delete children first")
      ) {
        reply.status(400).send({
          error: message,
          statusCode: 400,
        });
        return;
      }
    }

    // Unknown error - rethrow
    throw error;
  };

  // GET /work-items - List all work items with optional filters
  app.get("/", async (request, reply) => {
    try {
      const query = QueryParamsSchema.parse(request.query);
      // Build filters only with defined values
      const hasFilters = query.status !== undefined || query.type !== undefined;
      if (!hasFilters) {
        const items = await service.getAll();
        return items;
      }
      const filters = {
        ...(query.status !== undefined && { status: query.status }),
        ...(query.type !== undefined && { type: query.type }),
      };
      const items = await service.getAll(filters);
      return items;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // POST /work-items - Create a new work item
  app.post("/", async (request, reply) => {
    try {
      const parsed = CreateWorkItemSchema.parse(request.body);
      // Build input object with only defined properties
      const data: Parameters<typeof service.create>[0] = {
        title: parsed.title,
        type: parsed.type,
        createdBy: parsed.createdBy,
      };
      if (parsed.description !== undefined) data.description = parsed.description;
      if (parsed.parentId !== undefined) data.parentId = parsed.parentId;
      if (parsed.successCriteria !== undefined) data.successCriteria = parsed.successCriteria;
      if (parsed.linkedFiles !== undefined) data.linkedFiles = parsed.linkedFiles;
      if (parsed.status !== undefined) data.status = parsed.status;

      const item = await service.create(data);
      reply.status(201);
      return item;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // GET /work-items/:id - Get a work item by ID
  app.get("/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const item = await service.getById(id);
      if (!item) {
        reply.status(404).send({
          error: "Work item not found",
          statusCode: 404,
        });
        return;
      }
      return item;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // PATCH /work-items/:id - Update a work item
  app.patch("/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const parsed = UpdateWorkItemSchema.parse(request.body);
      // Build update object with only defined properties
      const data: Parameters<typeof service.update>[1] = {};
      if (parsed.title !== undefined) data.title = parsed.title;
      if (parsed.description !== undefined) data.description = parsed.description;
      if (parsed.linkedFiles !== undefined) data.linkedFiles = parsed.linkedFiles;
      if (parsed.successCriteria !== undefined) {
        // Map to ensure proper typing
        data.successCriteria = parsed.successCriteria.map((c) => ({
          id: c.id,
          description: c.description,
          completed: c.completed,
          ...(c.verifiedBy !== undefined && { verifiedBy: c.verifiedBy }),
          ...(c.verifiedAt !== undefined && { verifiedAt: c.verifiedAt }),
        }));
      }
      if (parsed.requiresApproval !== undefined) {
        data.requiresApproval = parsed.requiresApproval as Record<string, boolean>;
      }

      const item = await service.update(id, data);
      return item;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // DELETE /work-items/:id - Delete a work item
  app.delete("/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await service.delete(id);
      reply.status(204).send();
    } catch (error) {
      handleError(error, reply);
    }
  });

  // POST /work-items/:id/transition - Transition work item status
  app.post("/:id/transition", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { status } = TransitionSchema.parse(request.body);
      const item = await service.transitionStatus(id, status);
      return item;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // POST /work-items/:id/assign - Assign an agent to a work item
  app.post("/:id/assign", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { role, agentId } = AssignAgentSchema.parse(request.body);
      const item = await service.assignAgent(id, role as AgentRole, agentId);
      return item;
    } catch (error) {
      handleError(error, reply);
    }
  });

  // POST /work-items/:id/success-criteria - Add a success criterion
  app.post("/:id/success-criteria", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const parsed = SuccessCriterionSchema.parse(request.body);
      // Build criterion object with required completed field
      const criterion: Parameters<typeof service.addSuccessCriterion>[1] = {
        description: parsed.description,
        completed: parsed.completed ?? false,
      };
      const item = await service.addSuccessCriterion(id, criterion);
      return item;
    } catch (error) {
      handleError(error, reply);
    }
  });
}
