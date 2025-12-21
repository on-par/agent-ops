import type { FastifyInstance } from "fastify";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import type { DrizzleDatabase } from "../db/index.js";
import {
  workItems,
  workItemTypes,
  workItemStatuses,
  type WorkItem,
  type WorkItemType,
  type WorkItemStatus,
  type SuccessCriterion,
} from "../db/schema.js";
import { broadcaster } from "../lib/broadcaster.js";

// Validation schemas
const successCriterionSchema = z.object({
  id: z.string(),
  description: z.string(),
  completed: z.boolean(),
  verifiedBy: z.string().optional(),
  verifiedAt: z.number().optional(),
});

const createWorkItemSchema = z.object({
  title: z.string().min(1, "Title is required"),
  type: z.enum(workItemTypes),
  description: z.string().default(""),
  successCriteria: z.array(successCriterionSchema).default([]),
  linkedFiles: z.array(z.string()).default([]),
  createdBy: z.string().min(1, "Created by is required"),
  parentId: z.string().optional(),
  assignedAgents: z.record(z.string(), z.string().optional()).default({}),
  requiresApproval: z.record(z.string(), z.boolean()).default({}),
});

const updateWorkItemSchema = z.object({
  title: z.string().min(1).optional(),
  type: z.enum(workItemTypes).optional(),
  description: z.string().optional(),
  successCriteria: z.array(successCriterionSchema).optional(),
  linkedFiles: z.array(z.string()).optional(),
  assignedAgents: z.record(z.string(), z.string().optional()).optional(),
  requiresApproval: z.record(z.string(), z.boolean()).optional(),
  parentId: z.string().optional(),
  status: z.enum(workItemStatuses).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(workItemStatuses),
});

const listQuerySchema = z.object({
  status: z.enum(workItemStatuses).optional(),
  type: z.enum(workItemTypes).optional(),
  createdBy: z.string().optional(),
});

// Workflow validation for status transitions
const validStatusTransitions: Record<WorkItemStatus, WorkItemStatus[]> = {
  backlog: ["ready", "done"],
  ready: ["in_progress", "backlog"],
  in_progress: ["review", "ready", "backlog"],
  review: ["done", "in_progress"],
  done: ["backlog"], // Allow reopening
};

function isValidStatusTransition(
  from: WorkItemStatus,
  to: WorkItemStatus
): boolean {
  return validStatusTransitions[from]?.includes(to) ?? false;
}

export async function workItemRoutes(
  app: FastifyInstance,
  { db }: { db: DrizzleDatabase }
) {
  // GET /api/work-items - List all work items with filters
  app.get("/", async (request, reply) => {
    try {
      const queryResult = listQuerySchema.safeParse(request.query);

      if (!queryResult.success) {
        return reply.status(400).send({
          error: "Invalid query parameters",
          details: queryResult.error.issues,
        });
      }

      const { status, type, createdBy } = queryResult.data;

      let query = db.select().from(workItems);

      // Apply filters
      const conditions = [];
      if (status) {
        conditions.push(eq(workItems.status, status));
      }
      if (type) {
        conditions.push(eq(workItems.type, type));
      }
      if (createdBy) {
        conditions.push(eq(workItems.createdBy, createdBy));
      }

      const items =
        conditions.length > 0
          ? await query.where(and(...conditions))
          : await query;

      return reply.send({
        data: items,
        count: items.length,
      });
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: "Failed to fetch work items",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // GET /api/work-items/:id - Get single work item
  app.get("/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const [item] = await db
        .select()
        .from(workItems)
        .where(eq(workItems.id, id));

      if (!item) {
        return reply.status(404).send({
          error: "Work item not found",
        });
      }

      return reply.send({ data: item });
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: "Failed to fetch work item",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // POST /api/work-items - Create work item
  app.post("/", async (request, reply) => {
    try {
      const validationResult = createWorkItemSchema.safeParse(request.body);

      if (!validationResult.success) {
        return reply.status(400).send({
          error: "Invalid request body",
          details: validationResult.error.issues,
        });
      }

      const data = validationResult.data;
      const now = new Date();

      const newWorkItem = {
        id: uuidv4(),
        title: data.title,
        type: data.type,
        status: "backlog" as WorkItemStatus,
        description: data.description,
        successCriteria: data.successCriteria as SuccessCriterion[],
        linkedFiles: data.linkedFiles,
        createdBy: data.createdBy,
        assignedAgents: data.assignedAgents,
        requiresApproval: data.requiresApproval,
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        completedAt: null,
        parentId: data.parentId ?? null,
        childIds: [],
        blockedBy: [],
      };

      await db.insert(workItems).values(newWorkItem);

      // If this has a parent, update the parent's childIds
      if (data.parentId) {
        const [parent] = await db
          .select()
          .from(workItems)
          .where(eq(workItems.id, data.parentId));

        if (parent) {
          const updatedChildIds = [...parent.childIds, newWorkItem.id];
          await db
            .update(workItems)
            .set({
              childIds: updatedChildIds,
              updatedAt: now,
            })
            .where(eq(workItems.id, data.parentId));

          // Broadcast parent update
          const [updatedParent] = await db
            .select()
            .from(workItems)
            .where(eq(workItems.id, data.parentId));
          if (updatedParent) {
            broadcaster.broadcastWorkItemUpdate(updatedParent);
          }
        }
      }

      // Broadcast the new work item
      broadcaster.broadcastWorkItemUpdate(newWorkItem);

      return reply.status(201).send({ data: newWorkItem });
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: "Failed to create work item",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // PUT /api/work-items/:id - Update work item
  app.put("/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const validationResult = updateWorkItemSchema.safeParse(request.body);

      if (!validationResult.success) {
        return reply.status(400).send({
          error: "Invalid request body",
          details: validationResult.error.issues,
        });
      }

      const data = validationResult.data;

      // Check if work item exists
      const [existingItem] = await db
        .select()
        .from(workItems)
        .where(eq(workItems.id, id));

      if (!existingItem) {
        return reply.status(404).send({
          error: "Work item not found",
        });
      }

      // Validate status transition if status is being updated
      if (data.status && data.status !== existingItem.status) {
        if (!isValidStatusTransition(existingItem.status, data.status)) {
          return reply.status(400).send({
            error: "Invalid status transition",
            message: `Cannot transition from ${existingItem.status} to ${data.status}`,
          });
        }
      }

      const now = new Date();

      // Filter out undefined values for exactOptionalPropertyTypes
      const updates: Partial<WorkItem> = {
        updatedAt: now,
      };

      if (data.title !== undefined) updates.title = data.title;
      if (data.type !== undefined) updates.type = data.type;
      if (data.description !== undefined) updates.description = data.description;
      if (data.successCriteria !== undefined) updates.successCriteria = data.successCriteria as SuccessCriterion[];
      if (data.linkedFiles !== undefined) updates.linkedFiles = data.linkedFiles;
      if (data.assignedAgents !== undefined) updates.assignedAgents = data.assignedAgents;
      if (data.requiresApproval !== undefined) updates.requiresApproval = data.requiresApproval;
      if (data.parentId !== undefined) updates.parentId = data.parentId;
      if (data.status !== undefined) updates.status = data.status;

      // Update startedAt when moving to in_progress
      if (data.status === "in_progress" && !existingItem.startedAt) {
        updates.startedAt = now;
      }

      // Update completedAt when moving to done
      if (data.status === "done" && !existingItem.completedAt) {
        updates.completedAt = now;
      }

      // Clear completedAt when moving away from done
      if (
        data.status &&
        data.status !== "done" &&
        existingItem.status === "done"
      ) {
        updates.completedAt = null;
      }

      await db.update(workItems).set(updates).where(eq(workItems.id, id));

      const [updatedItem] = await db
        .select()
        .from(workItems)
        .where(eq(workItems.id, id));

      // Broadcast the updated work item
      if (updatedItem) {
        broadcaster.broadcastWorkItemUpdate(updatedItem);
      }

      return reply.send({ data: updatedItem });
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: "Failed to update work item",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // PATCH /api/work-items/:id/status - Update status only with workflow validation
  app.patch("/:id/status", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const validationResult = updateStatusSchema.safeParse(request.body);

      if (!validationResult.success) {
        return reply.status(400).send({
          error: "Invalid request body",
          details: validationResult.error.issues,
        });
      }

      const { status: newStatus } = validationResult.data;

      // Check if work item exists
      const [existingItem] = await db
        .select()
        .from(workItems)
        .where(eq(workItems.id, id));

      if (!existingItem) {
        return reply.status(404).send({
          error: "Work item not found",
        });
      }

      // Validate status transition
      if (newStatus !== existingItem.status) {
        if (!isValidStatusTransition(existingItem.status, newStatus)) {
          return reply.status(400).send({
            error: "Invalid status transition",
            message: `Cannot transition from ${existingItem.status} to ${newStatus}`,
            allowedTransitions: validStatusTransitions[existingItem.status],
          });
        }
      }

      const now = new Date();
      const updates: Partial<WorkItem> = {
        status: newStatus,
        updatedAt: now,
      };

      // Update startedAt when moving to in_progress
      if (newStatus === "in_progress" && !existingItem.startedAt) {
        updates.startedAt = now;
      }

      // Update completedAt when moving to done
      if (newStatus === "done" && !existingItem.completedAt) {
        updates.completedAt = now;
      }

      // Clear completedAt when moving away from done
      if (newStatus !== "done" && existingItem.status === "done") {
        updates.completedAt = null;
      }

      await db.update(workItems).set(updates).where(eq(workItems.id, id));

      const [updatedItem] = await db
        .select()
        .from(workItems)
        .where(eq(workItems.id, id));

      // Broadcast the updated work item
      if (updatedItem) {
        broadcaster.broadcastWorkItemUpdate(updatedItem);
      }

      return reply.send({ data: updatedItem });
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: "Failed to update work item status",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // DELETE /api/work-items/:id - Delete work item
  app.delete("/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      // Check if work item exists
      const [existingItem] = await db
        .select()
        .from(workItems)
        .where(eq(workItems.id, id));

      if (!existingItem) {
        return reply.status(404).send({
          error: "Work item not found",
        });
      }

      // Remove from parent's childIds if it has a parent
      if (existingItem.parentId) {
        const [parent] = await db
          .select()
          .from(workItems)
          .where(eq(workItems.id, existingItem.parentId));

        if (parent) {
          const updatedChildIds = parent.childIds.filter(
            (childId) => childId !== id
          );
          await db
            .update(workItems)
            .set({
              childIds: updatedChildIds,
              updatedAt: new Date(),
            })
            .where(eq(workItems.id, existingItem.parentId));
        }
      }

      await db.delete(workItems).where(eq(workItems.id, id));

      return reply.status(204).send();
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: "Failed to delete work item",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}
