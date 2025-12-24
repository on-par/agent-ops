/**
 * Services Barrel Export
 * Re-exports all service classes for convenient importing
 */

export {
  WorkItemService,
  type CreateWorkItemInput,
  type UpdateWorkItemInput,
} from "./work-item.service.js";

export {
  WorkflowEngineService,
  type WorkflowState,
} from "./workflow-engine.service.js";

export {
  WorkerPoolService,
  type WorkerPoolConfig,
  type MetricUpdate,
  type WorkerPoolSummary,
} from "./worker-pool.service.js";

export {
  ObservabilityService,
  type TraceQueryOptions,
  type CostQueryOptions,
  type SystemMetrics,
  type WorkerMetrics,
  type ToolCallStats,
  type CostSummaryEntry,
  type AgentStateData,
  type WorkItemUpdateData,
  type ToolCallData,
  type ErrorData,
  type ApprovalRequiredData,
} from "./observability.service.js";

export {
  WebSocketHubService,
  type WebSocketConnection,
  type WebSocketEvent,
  type WebSocketEventType,
  type WebSocketWorkerMetrics,
} from "./websocket-hub.service.js";

export { TemplateRegistryService } from "./template-registry.service.js";

export {
  GitHubService,
  type GitHubAuthResult,
} from "./github.service.js";

export { GitHubSyncService } from "./github-sync.service.js";
