/**
 * Services Barrel Export
 * Re-exports all service classes for convenient importing
 */

export {
  WorkItemService,
  type CreateWorkItemInput,
  type UpdateWorkItemInput,
} from "../features/work-items/services/work-item.service.js";

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

export {
  GitHubPRService,
  type CreatePRInput,
  type PRResult,
} from "./github-pr.service.js";

export {
  WorkspaceManagerService,
  type WorkspaceManagerConfig,
} from "./workspace-manager.service.js";

export {
  GitOperationsService,
  type GitCloneOptions,
  type GitCommitOptions,
  type GitStatus,
} from "./git-operations.service.js";

export {
  AgentOutputCollectorService,
  type CollectedOutput,
} from "../features/agent-runtime/services/agent-output-collector.service.js";

export {
  AgentExecutorService,
  type ExecutionContext,
  type ExecutionResult,
} from "../features/agent-runtime/services/agent-executor.service.js";

export {
  AgentLifecycleService,
  type LifecycleHookType,
  type PreExecutionHook,
  type PostExecutionHook,
  type ErrorHook,
  type StatusChangeHook,
} from "../features/agent-runtime/services/agent-lifecycle.service.js";

export {
  OrchestrationService,
  WorkItemQueueManager,
  AgentAssignmentService,
  ProgressTrackingService,
  ErrorHandlingService,
  ConcurrencyLimitsService,
  type OrchestrationConfig,
  type QueueItem,
  type AssignmentResult,
  type ProgressEvent,
  type ErrorCategory,
  type RetryContext,
  type OrchestratorStatus,
  type ConcurrencyStatus,
} from "./orchestration.service.js";
