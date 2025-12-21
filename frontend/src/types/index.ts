// Type definitions matching backend schema

// ============================================================================
// Enums
// ============================================================================

export const workItemTypes = ["feature", "bug", "research", "task"] as const;
export type WorkItemType = (typeof workItemTypes)[number];

export const workItemStatuses = [
  "backlog",
  "ready",
  "in_progress",
  "review",
  "done",
] as const;
export type WorkItemStatus = (typeof workItemStatuses)[number];

export const agentRoles = [
  "refiner",
  "implementer",
  "tester",
  "reviewer",
] as const;
export type AgentRole = (typeof agentRoles)[number];

export const permissionModes = [
  "askUser",
  "acceptEdits",
  "bypassPermissions",
] as const;
export type PermissionMode = (typeof permissionModes)[number];

export const workerStatuses = [
  "idle",
  "working",
  "paused",
  "error",
  "terminated",
] as const;
export type WorkerStatus = (typeof workerStatuses)[number];

export const traceEventTypes = [
  "agent_state",
  "work_item_update",
  "tool_call",
  "metric_update",
  "error",
  "approval_required",
] as const;
export type TraceEventType = (typeof traceEventTypes)[number];

// ============================================================================
// Nested Types
// ============================================================================

export interface SuccessCriterion {
  id: string;
  description: string;
  completed: boolean;
  verifiedBy?: string;
  verifiedAt?: number; // Unix timestamp ms
}

export interface MCPServerConfig {
  name: string;
  type: "stdio" | "sse" | "inprocess";
  command?: string;
  url?: string;
  args: string[];
  env: Record<string, string>;
}

// ============================================================================
// Core Entity Types
// ============================================================================

export interface WorkItem {
  id: string;
  title: string;
  type: WorkItemType;
  status: WorkItemStatus;

  // Content
  description: string;
  successCriteria: SuccessCriterion[];
  linkedFiles: string[];

  // Workflow
  createdBy: string;
  assignedAgents: Record<string, string | undefined>;
  requiresApproval: Record<string, boolean>;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;

  // Relationships
  parentId?: string;
  childIds: string[];
  blockedBy: string[];
}

export interface Template {
  id: string;
  name: string;
  description: string;
  createdBy: string;

  // Claude Agent SDK configuration
  systemPrompt: string;
  permissionMode: PermissionMode;
  maxTurns: number;

  // Tools
  builtinTools: string[];
  mcpServers: MCPServerConfig[];

  // Agent Ops metadata
  allowedWorkItemTypes: string[];
  defaultRole?: AgentRole;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface Worker {
  id: string;
  templateId: string;
  status: WorkerStatus;

  // Current work
  currentWorkItemId?: string;
  currentRole?: AgentRole;

  // SDK state
  sessionId: string;

  // Metrics
  spawnedAt: Date;
  contextWindowUsed: number;
  contextWindowLimit: number;
  tokensUsed: number;
  costUsd: number;
  toolCalls: number;
  errors: number;
}

export interface Trace {
  id: string;
  workerId?: string;
  workItemId?: string;

  // Event details
  eventType: TraceEventType;
  data: unknown;

  // Timestamp
  timestamp: Date;
}

// ============================================================================
// Create/Update DTOs
// ============================================================================

export interface CreateWorkItemDTO {
  title: string;
  type: WorkItemType;
  description?: string;
  successCriteria?: SuccessCriterion[];
  linkedFiles?: string[];
  parentId?: string;
  assignedAgents?: Record<string, string | undefined>;
}

export interface UpdateWorkItemDTO {
  title?: string;
  type?: WorkItemType;
  status?: WorkItemStatus;
  description?: string;
  successCriteria?: SuccessCriterion[];
  linkedFiles?: string[];
  assignedAgents?: Record<string, string | undefined>;
  requiresApproval?: Record<string, boolean>;
}

export interface CreateTemplateDTO {
  name: string;
  description?: string;
  systemPrompt: string;
  permissionMode?: PermissionMode;
  maxTurns?: number;
  builtinTools?: string[];
  mcpServers?: MCPServerConfig[];
  allowedWorkItemTypes?: string[];
  defaultRole?: AgentRole;
}

export interface UpdateTemplateDTO {
  name?: string;
  description?: string;
  systemPrompt?: string;
  permissionMode?: PermissionMode;
  maxTurns?: number;
  builtinTools?: string[];
  mcpServers?: MCPServerConfig[];
  allowedWorkItemTypes?: string[];
  defaultRole?: AgentRole;
}

export interface SpawnWorkerDTO {
  templateId: string;
  workItemId?: string;
  role?: AgentRole;
}

export interface ControlWorkerDTO {
  action: "pause" | "resume" | "terminate";
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T> {
  data: T;
  success: true;
}

export interface ApiError {
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
  success: false;
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

// ============================================================================
// WebSocket Message Types
// ============================================================================

export interface WSMessage {
  type: "agent_update" | "work_item_update" | "trace" | "error";
  payload: unknown;
}

export interface AgentUpdateMessage extends WSMessage {
  type: "agent_update";
  payload: {
    workerId: string;
    status: WorkerStatus;
    metrics?: Partial<Pick<Worker, "contextWindowUsed" | "tokensUsed" | "costUsd" | "toolCalls" | "errors">>;
  };
}

export interface WorkItemUpdateMessage extends WSMessage {
  type: "work_item_update";
  payload: {
    workItemId: string;
    status: WorkItemStatus;
    updates: Partial<WorkItem>;
  };
}

export interface TraceMessage extends WSMessage {
  type: "trace";
  payload: Trace;
}

export interface ErrorMessage extends WSMessage {
  type: "error";
  payload: {
    message: string;
    workerId?: string;
    workItemId?: string;
  };
}

export type WebSocketMessage =
  | AgentUpdateMessage
  | WorkItemUpdateMessage
  | TraceMessage
  | ErrorMessage;

// ============================================================================
// UI State Types
// ============================================================================

export interface UIState {
  selectedWorkItemId: string | null;
  selectedWorkerId: string | null;
  selectedTemplateId: string | null;
  sidebarOpen: boolean;
  activeModal: "createWorkItem" | "createTemplate" | "spawnWorker" | null;
}

// ============================================================================
// Filter and Sort Types
// ============================================================================

export interface WorkItemFilters {
  status?: WorkItemStatus[];
  type?: WorkItemType[];
  assignedAgent?: string;
  search?: string;
}

export interface WorkerFilters {
  status?: WorkerStatus[];
  templateId?: string;
  search?: string;
}

export interface TemplateFilters {
  search?: string;
  createdBy?: string;
}
