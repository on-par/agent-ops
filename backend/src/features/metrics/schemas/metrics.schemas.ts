import { z } from "zod";

/**
 * Query schema for agent metrics endpoint
 */
export const AgentMetricsQuerySchema = z.object({
  templateId: z.string().optional(),
  status: z.enum(["active", "idle", "offline"]).optional(),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 50))
    .catch(50),
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 0))
    .catch(0),
});

export type AgentMetricsQuery = z.infer<typeof AgentMetricsQuerySchema>;

/**
 * Query schema for work metrics endpoint
 */
export const WorkMetricsQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  type: z.string().optional(),
});

export type WorkMetricsQuery = z.infer<typeof WorkMetricsQuerySchema>;

/**
 * Query schema for traces endpoint
 */
export const TracesQuerySchema = z.object({
  workerId: z.string().optional(),
  workItemId: z.string().optional(),
  eventType: z
    .enum([
      "agent_state",
      "work_item_update",
      "tool_call",
      "metric_update",
      "error",
      "approval_required",
    ])
    .optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 100))
    .catch(100),
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 0))
    .catch(0),
});

export type TracesQuery = z.infer<typeof TracesQuerySchema>;
