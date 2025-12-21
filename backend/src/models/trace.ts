import { z } from "zod";

/**
 * Trace Event Type Enum
 * Represents different types of events that can be traced in the agent ops system
 */
export const TraceEventType = z.enum([
  "agent_state",
  "work_item_update",
  "tool_call",
  "metric_update",
  "error",
  "approval_required",
]);

export type TraceEventType = z.infer<typeof TraceEventType>;

/**
 * Trace Schema
 * Represents a single trace event for observability and debugging
 * Aligns with the Drizzle schema in db/schema.ts
 */
export const TraceSchema = z.object({
  /**
   * Unique identifier for the trace event
   */
  id: z.string(),

  /**
   * ID of the worker that generated this trace
   * Optional as some traces may not be associated with a specific worker
   */
  workerId: z.string().nullable().optional(),

  /**
   * ID of the work item being processed when this trace was generated
   * Optional as some traces may not be associated with a work item
   */
  workItemId: z.string().nullable().optional(),

  /**
   * Type of event being traced
   */
  eventType: TraceEventType,

  /**
   * Event-specific data payload
   * This is a flexible JSON field that varies based on eventType:
   * - agent_state: { status, currentRole, sessionId, ... }
   * - work_item_update: { previousStatus, newStatus, ... }
   * - tool_call: { toolName, parameters, result, duration, ... }
   * - metric_update: { metricName, value, ... }
   * - error: { message, stack, errorType, ... }
   * - approval_required: { action, reason, ... }
   */
  data: z.unknown().default({}),

  /**
   * Timestamp when the event occurred (Unix milliseconds)
   */
  timestamp: z.date(),
});

export type Trace = z.infer<typeof TraceSchema>;

/**
 * Schema for creating a new trace event
 * Used for validation when inserting new traces
 */
export const NewTraceSchema = TraceSchema.partial({ id: true });

export type NewTrace = z.infer<typeof NewTraceSchema>;

/**
 * Event-specific data schemas for type safety
 * These can be used to validate the data field based on eventType
 */

export const AgentStateDataSchema = z.object({
  status: z.enum(["idle", "working", "paused", "error", "terminated"]),
  currentRole: z
    .enum(["refiner", "implementer", "tester", "reviewer"])
    .nullable()
    .optional(),
  sessionId: z.string().optional(),
  contextWindowUsed: z.number().optional(),
  tokensUsed: z.number().optional(),
});

export type AgentStateData = z.infer<typeof AgentStateDataSchema>;

export const WorkItemUpdateDataSchema = z.object({
  previousStatus: z
    .enum(["backlog", "ready", "in_progress", "review", "done"])
    .optional(),
  newStatus: z.enum(["backlog", "ready", "in_progress", "review", "done"]),
  updatedBy: z.string().optional(),
  reason: z.string().optional(),
});

export type WorkItemUpdateData = z.infer<typeof WorkItemUpdateDataSchema>;

export const ToolCallDataSchema = z.object({
  toolName: z.string(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  result: z.unknown().optional(),
  error: z.string().optional(),
  durationMs: z.number().optional(),
  success: z.boolean(),
});

export type ToolCallData = z.infer<typeof ToolCallDataSchema>;

export const MetricUpdateDataSchema = z.object({
  metricName: z.string(),
  value: z.number(),
  previousValue: z.number().optional(),
  unit: z.string().optional(),
});

export type MetricUpdateData = z.infer<typeof MetricUpdateDataSchema>;

export const ErrorDataSchema = z.object({
  message: z.string(),
  stack: z.string().optional(),
  errorType: z.string().optional(),
  severity: z.enum(["warning", "error", "critical"]).default("error"),
  recoverable: z.boolean().default(false),
});

export type ErrorData = z.infer<typeof ErrorDataSchema>;

export const ApprovalRequiredDataSchema = z.object({
  action: z.string(),
  reason: z.string(),
  context: z.record(z.string(), z.unknown()).optional(),
  requestedBy: z.string(),
  approved: z.boolean().nullable().optional(),
  approvedBy: z.string().nullable().optional(),
  approvedAt: z.number().nullable().optional(), // Unix timestamp
});

export type ApprovalRequiredData = z.infer<typeof ApprovalRequiredDataSchema>;
