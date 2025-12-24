import { z } from "zod";

/**
 * Work Item Type Enum
 * Defines the category of work to be performed
 */
export const WorkItemTypeSchema = z.enum([
  "feature",
  "bug",
  "research",
  "task",
]);
export type WorkItemType = z.infer<typeof WorkItemTypeSchema>;

/**
 * Work Item Status Enum
 * Defines the current state of a work item in its lifecycle
 */
export const WorkItemStatusSchema = z.enum([
  "backlog",
  "ready",
  "in_progress",
  "review",
  "done",
]);
export type WorkItemStatus = z.infer<typeof WorkItemStatusSchema>;

/**
 * Workflow Transition Enum
 * Defines valid state transitions in the work item lifecycle
 */
export const TransitionSchema = z.enum([
  "backlog_to_ready",
  "ready_to_in_progress",
  "in_progress_to_review",
  "review_to_done",
  "review_to_in_progress",
  "in_progress_to_backlog",
  "ready_to_backlog",
  "any_to_backlog", // For cancellation or re-prioritization
]);
export type Transition = z.infer<typeof TransitionSchema>;

/**
 * Success Criterion Schema
 * Represents a single measurable success criterion for a work item
 */
export const SuccessCriterionSchema = z.object({
  id: z.string().describe("Unique identifier for the success criterion"),
  description: z
    .string()
    .min(1)
    .describe("Clear description of what success looks like"),
  completed: z
    .boolean()
    .default(false)
    .describe("Whether this criterion has been met"),
  verifiedBy: z
    .string()
    .optional()
    .describe("Agent or user ID who verified this criterion"),
  verifiedAt: z
    .number()
    .int()
    .optional()
    .describe("Unix timestamp (ms) when verification occurred"),
});
export type SuccessCriterion = z.infer<typeof SuccessCriterionSchema>;

/**
 * Work Item Schema
 * Complete schema for a work item including all fields and validation
 */
export const WorkItemSchema = z.object({
  // Identity
  id: z.string().describe("Unique identifier for the work item"),
  title: z.string().min(1).describe("Brief title describing the work"),
  type: WorkItemTypeSchema.describe("Type of work item"),
  status: WorkItemStatusSchema.default("backlog").describe(
    "Current status in the workflow"
  ),

  // Content
  description: z
    .string()
    .default("")
    .describe("Detailed description of the work to be done"),
  successCriteria: z
    .array(SuccessCriterionSchema)
    .default([])
    .describe("List of measurable success criteria"),
  linkedFiles: z
    .array(z.string())
    .default([])
    .describe("File paths relevant to this work item"),

  // Workflow
  createdBy: z.string().describe("User or agent ID who created this item"),
  assignedAgents: z
    .record(z.string(), z.string().optional())
    .default({})
    .describe("Map of role to agent ID (e.g., {'refiner': 'agent-123'})"),
  requiresApproval: z
    .record(z.string(), z.boolean())
    .default({})
    .describe("Map of transition to approval requirement"),

  // Timestamps (stored as Unix milliseconds)
  createdAt: z
    .number()
    .int()
    .describe("Unix timestamp (ms) when item was created"),
  updatedAt: z
    .number()
    .int()
    .describe("Unix timestamp (ms) when item was last updated"),
  startedAt: z
    .number()
    .int()
    .optional()
    .describe("Unix timestamp (ms) when work began"),
  completedAt: z
    .number()
    .int()
    .optional()
    .describe("Unix timestamp (ms) when work was completed"),

  // Relationships
  parentId: z
    .string()
    .optional()
    .describe("ID of parent work item (for subtasks)"),
  childIds: z
    .array(z.string())
    .default([])
    .describe("Array of child work item IDs"),
  blockedBy: z
    .array(z.string())
    .default([])
    .describe("Array of work item IDs that block this item"),
});
export type WorkItem = z.infer<typeof WorkItemSchema>;

/**
 * Partial Work Item Schema for updates
 * Allows partial updates to work items
 */
export const WorkItemUpdateSchema = WorkItemSchema.partial().omit({
  id: true,
  createdAt: true,
});
export type WorkItemUpdate = z.infer<typeof WorkItemUpdateSchema>;

/**
 * New Work Item Schema for creation
 * Required fields for creating a new work item
 */
export const NewWorkItemSchema = WorkItemSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type NewWorkItem = z.infer<typeof NewWorkItemSchema>;
