import type { FastifyInstance } from "fastify";
import { eq, and, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import type { DrizzleDatabase } from "../db/index.js";
import { traces, traceEventTypes, type Trace } from "../db/schema.js";
import { broadcaster } from "../lib/broadcaster.js";

// Validation schemas
const createTraceSchema = z.object({
  workerId: z.string().optional(),
  workItemId: z.string().optional(),
  eventType: z.enum(traceEventTypes),
  data: z.unknown().default({}),
});

const listQuerySchema = z.object({
  workerId: z.string().optional(),
  workItemId: z.string().optional(),
  eventType: z.enum(traceEventTypes).optional(),
  startDate: z.coerce.number().optional(), // Unix timestamp in milliseconds
  endDate: z.coerce.number().optional(), // Unix timestamp in milliseconds
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function traceRoutes(
  app: FastifyInstance,
  { db }: { db: DrizzleDatabase }
) {
  // GET /api/traces - List traces with filters
  app.get("/", async (request, reply) => {
    try {
      const queryResult = listQuerySchema.safeParse(request.query);

      if (!queryResult.success) {
        return reply.status(400).send({
          error: "Invalid query parameters",
          details: queryResult.error.issues,
        });
      }

      const {
        workerId,
        workItemId,
        eventType,
        startDate,
        endDate,
        limit,
        offset,
      } = queryResult.data;

      let query = db.select().from(traces);

      // Build filter conditions
      const conditions = [];

      if (workerId) {
        conditions.push(eq(traces.workerId, workerId));
      }

      if (workItemId) {
        conditions.push(eq(traces.workItemId, workItemId));
      }

      if (eventType) {
        conditions.push(eq(traces.eventType, eventType));
      }

      if (startDate) {
        conditions.push(gte(traces.timestamp, new Date(startDate)));
      }

      if (endDate) {
        conditions.push(lte(traces.timestamp, new Date(endDate)));
      }

      // Get all matching traces with filters
      const allTraces = conditions.length > 0
        ? await db.select().from(traces).where(and(...conditions))
        : await db.select().from(traces);

      // Sort by timestamp descending (most recent first)
      const sortedTraces = allTraces.sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
      );

      // Apply pagination
      const paginatedTraces = sortedTraces.slice(offset, offset + limit);
      const total = sortedTraces.length;

      return reply.send({
        data: paginatedTraces,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      });
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: "Failed to fetch traces",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // GET /api/traces/:id - Get single trace
  app.get("/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const [trace] = await db.select().from(traces).where(eq(traces.id, id));

      if (!trace) {
        return reply.status(404).send({
          error: "Trace not found",
        });
      }

      return reply.send({ data: trace });
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: "Failed to fetch trace",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // POST /api/traces - Create trace event
  app.post("/", async (request, reply) => {
    try {
      const validationResult = createTraceSchema.safeParse(request.body);

      if (!validationResult.success) {
        return reply.status(400).send({
          error: "Invalid request body",
          details: validationResult.error.issues,
        });
      }

      const data = validationResult.data;

      const newTrace = {
        id: uuidv4(),
        workerId: data.workerId ?? null,
        workItemId: data.workItemId ?? null,
        eventType: data.eventType,
        data: data.data,
        timestamp: new Date(),
      };

      await db.insert(traces).values(newTrace);

      // Broadcast the new trace event
      broadcaster.broadcastTrace(newTrace);

      return reply.status(201).send({ data: newTrace });
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: "Failed to create trace",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // DELETE /api/traces - Bulk delete traces (for cleanup/maintenance)
  app.delete("/", async (request, reply) => {
    try {
      const queryResult = z
        .object({
          workerId: z.string().optional(),
          workItemId: z.string().optional(),
          beforeDate: z.coerce.number().optional(), // Unix timestamp
        })
        .safeParse(request.query);

      if (!queryResult.success) {
        return reply.status(400).send({
          error: "Invalid query parameters",
          details: queryResult.error.issues,
        });
      }

      const { workerId, workItemId, beforeDate } = queryResult.data;

      // Build filter conditions
      const conditions = [];

      if (workerId) {
        conditions.push(eq(traces.workerId, workerId));
      }

      if (workItemId) {
        conditions.push(eq(traces.workItemId, workItemId));
      }

      if (beforeDate) {
        conditions.push(lte(traces.timestamp, new Date(beforeDate)));
      }

      if (conditions.length === 0) {
        return reply.status(400).send({
          error: "At least one filter parameter is required for bulk delete",
        });
      }

      // Delete traces matching the filters
      await db.delete(traces).where(and(...conditions));

      return reply.status(204).send();
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({
        error: "Failed to delete traces",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}
