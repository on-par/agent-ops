import { z } from "zod";
import { AgentRoleSchema } from "../../templates/models/template.js";

/**
 * Worker status types representing the current state of an agent worker
 */
export const WorkerStatusSchema = z.enum([
  "idle",
  "working",
  "paused",
  "error",
  "terminated",
]);
export type WorkerStatus = z.infer<typeof WorkerStatusSchema>;

/**
 * Agent worker schema
 * Represents a running agent instance with its current state and metrics
 */
export const AgentWorkerSchema = z.object({
  // Identity
  id: z.string().min(1, "Worker ID is required"),
  templateId: z.string().min(1, "Template ID is required"),
  status: WorkerStatusSchema.default("idle"),

  // Current work assignment
  currentWorkItemId: z.string().nullable().optional(),
  currentRole: AgentRoleSchema.nullable().optional(),

  // SDK state
  sessionId: z.string().min(1, "Session ID is required"),

  // Metrics
  spawnedAt: z.number().int().positive(),
  contextWindowUsed: z.number().int().nonnegative().default(0),
  contextWindowLimit: z.number().int().positive().default(200000),
  tokensUsed: z.number().int().nonnegative().default(0),
  costUsd: z.number().nonnegative().default(0),
  toolCalls: z.number().int().nonnegative().default(0),
  errors: z.number().int().nonnegative().default(0),
});
export type AgentWorker = z.infer<typeof AgentWorkerSchema>;

/**
 * Schema for creating a new agent worker (without auto-generated fields)
 */
export const CreateAgentWorkerSchema = AgentWorkerSchema.omit({
  id: true,
  spawnedAt: true,
}).extend({
  status: WorkerStatusSchema.optional(),
  contextWindowUsed: z.number().int().nonnegative().optional(),
  contextWindowLimit: z.number().int().positive().optional(),
  tokensUsed: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
  toolCalls: z.number().int().nonnegative().optional(),
  errors: z.number().int().nonnegative().optional(),
});
export type CreateAgentWorker = z.infer<typeof CreateAgentWorkerSchema>;

/**
 * Schema for updating an existing agent worker
 */
export const UpdateAgentWorkerSchema = AgentWorkerSchema.partial().omit({
  id: true,
  templateId: true,
  sessionId: true,
  spawnedAt: true,
});
export type UpdateAgentWorker = z.infer<typeof UpdateAgentWorkerSchema>;

/**
 * Worker pool schema (optional interface for managing multiple workers)
 * This represents a collection of workers and their aggregate metrics
 */
export const WorkerPoolSchema = z.object({
  workers: z.array(AgentWorkerSchema),
  totalWorkers: z.number().int().nonnegative(),
  activeWorkers: z.number().int().nonnegative(),
  idleWorkers: z.number().int().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  totalTokensUsed: z.number().int().nonnegative(),
  totalToolCalls: z.number().int().nonnegative(),
});
export type WorkerPool = z.infer<typeof WorkerPoolSchema>;

/**
 * Worker metrics summary (useful for dashboards and monitoring)
 */
export const WorkerMetricsSchema = z.object({
  workerId: z.string(),
  status: WorkerStatusSchema,
  contextWindowUsage: z.number().nonnegative().describe("Percentage of context window used (0-1)"),
  tokensUsed: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  uptime: z.number().int().nonnegative().describe("Milliseconds since spawned"),
});
export type WorkerMetrics = z.infer<typeof WorkerMetricsSchema>;
