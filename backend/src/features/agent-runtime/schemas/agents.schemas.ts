import { z } from "zod";

/**
 * Request schema for starting a new agent execution
 */
export const StartAgentSchema = z.object({
  taskId: z.string().min(1, "Task ID is required"),
  pattern: z.string().optional(),
});
export type StartAgentRequest = z.infer<typeof StartAgentSchema>;

/**
 * Path params schema for agent ID
 */
export const AgentIdParamsSchema = z.object({
  id: z.string().min(1, "Agent ID is required"),
});
export type AgentIdParams = z.infer<typeof AgentIdParamsSchema>;

/**
 * Query params schema for listing agents
 */
export const ListAgentsQuerySchema = z.object({
  status: z.enum(["pending", "running", "success", "error", "cancelled"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
  offset: z.coerce.number().int().min(0).default(0).optional(),
});
export type ListAgentsQuery = z.infer<typeof ListAgentsQuerySchema>;
