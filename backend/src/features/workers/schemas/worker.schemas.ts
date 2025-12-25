import { z } from "zod";
import { AgentRoleSchema } from "../../templates/models/template.js";

/**
 * Request validation schemas for worker API routes
 * These schemas validate incoming HTTP requests
 */

/**
 * Schema for spawning a new worker
 */
export const SpawnWorkerSchema = z.object({
  templateId: z.string().min(1, "Template ID is required"),
  sessionId: z.string().min(1, "Session ID is required"),
});
export type SpawnWorkerRequest = z.infer<typeof SpawnWorkerSchema>;

/**
 * Schema for assigning work to a worker
 */
export const AssignWorkSchema = z.object({
  workItemId: z.string().min(1, "Work item ID is required"),
  role: AgentRoleSchema,
});
export type AssignWorkRequest = z.infer<typeof AssignWorkSchema>;

/**
 * Schema for updating worker metrics
 */
export const UpdateMetricsSchema = z
  .object({
    tokensUsed: z.number().int().nonnegative().optional(),
    costUsd: z.number().nonnegative().optional(),
    toolCalls: z.number().int().nonnegative().optional(),
    contextWindowUsed: z.number().int().nonnegative().optional(),
  })
  .transform((data) => {
    // Remove undefined values to match MetricUpdate interface
    const result: Record<string, number> = {};
    if (data.tokensUsed !== undefined) result.tokensUsed = data.tokensUsed;
    if (data.costUsd !== undefined) result.costUsd = data.costUsd;
    if (data.toolCalls !== undefined) result.toolCalls = data.toolCalls;
    if (data.contextWindowUsed !== undefined)
      result.contextWindowUsed = data.contextWindowUsed;
    return result;
  }) as unknown as z.ZodType<{
    tokensUsed?: number;
    costUsd?: number;
    toolCalls?: number;
    contextWindowUsed?: number;
  }>;
export type UpdateMetricsRequest = z.infer<typeof UpdateMetricsSchema>;

/**
 * Schema for reporting worker errors
 */
export const ReportErrorSchema = z.object({
  error: z.string().min(1, "Error message is required"),
});
export type ReportErrorRequest = z.infer<typeof ReportErrorSchema>;

/**
 * Schema for worker ID in URL parameters
 */
export const WorkerIdParamsSchema = z.object({
  workerId: z.string().min(1, "Worker ID is required"),
});
export type WorkerIdParams = z.infer<typeof WorkerIdParamsSchema>;

/**
 * Schema for template ID query parameter
 */
export const TemplateIdQuerySchema = z.object({
  templateId: z.string().min(1, "Template ID is required").optional(),
});
export type TemplateIdQuery = z.infer<typeof TemplateIdQuerySchema>;

/**
 * Schema for injecting a message into a worker
 */
export const InjectSchema = z.object({
  message: z.string().min(1, "Injection message is required"),
  type: z.enum(["command", "data", "config"]).optional().default("command"),
  payload: z.record(z.string(), z.any()).optional(),
});
export type InjectRequest = z.infer<typeof InjectSchema>;
