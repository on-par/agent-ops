/**
 * Models Barrel Export
 * Re-exports all model schemas and types for convenient importing
 */

export {
  // Work Item schemas
  WorkItemTypeSchema,
  WorkItemStatusSchema,
  TransitionSchema,
  SuccessCriterionSchema,
  WorkItemSchema,
  WorkItemUpdateSchema,
  NewWorkItemSchema,
  // Work Item types
  type WorkItemType,
  type WorkItemStatus,
  type Transition,
  type SuccessCriterion,
  type WorkItem,
  type WorkItemUpdate,
  type NewWorkItem,
} from "./work-item.js";

export {
  // Trace schemas
  TraceEventType,
  TraceSchema,
  NewTraceSchema,
  AgentStateDataSchema,
  WorkItemUpdateDataSchema,
  ToolCallDataSchema,
  MetricUpdateDataSchema,
  ErrorDataSchema,
  ApprovalRequiredDataSchema,
  // Trace types
  type TraceEventType as TraceEventTypeEnum,
  type Trace,
  type NewTrace,
  type AgentStateData,
  type WorkItemUpdateData,
  type ToolCallData,
  type MetricUpdateData,
  type ErrorData,
  type ApprovalRequiredData,
} from "./trace.js";

export {
  // Template schemas
  AgentRoleSchema,
  PermissionModeSchema,
  MCPServerConfigSchema,
  AgentTemplateSchema,
  CreateAgentTemplateSchema,
  UpdateAgentTemplateSchema,
  // Template types
  type AgentRole,
  type PermissionMode,
  type MCPServerConfig,
  type AgentTemplate,
  type CreateAgentTemplate,
  type UpdateAgentTemplate,
} from "../features/templates/models/template.js";

export {
  // Worker schemas
  WorkerStatusSchema,
  AgentWorkerSchema,
  CreateAgentWorkerSchema,
  UpdateAgentWorkerSchema,
  WorkerPoolSchema,
  WorkerMetricsSchema,
  // Worker types
  type WorkerStatus,
  type AgentWorker,
  type CreateAgentWorker,
  type UpdateAgentWorker,
  type WorkerPool,
  type WorkerMetrics,
} from "./worker.js";
