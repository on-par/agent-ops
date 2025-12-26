/**
 * API response and request types
 * Defines the contract between frontend and backend APIs
 */

import type { WorkItem, Worker, DashboardStats } from './dashboard';

/**
 * Generic API error response type
 */
export interface ApiErrorResponse {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

/**
 * API error with discriminated union for different error types
 */
export type ApiError = {
  type: 'network' | 'validation' | 'server' | 'unauthorized' | 'not_found';
  message: string;
  statusCode?: number;
  details?: Record<string, unknown>;
};

/**
 * Generic API response wrapper (optional)
 */
export interface ApiResponse<T> {
  data: T;
  status: number;
  statusText: string;
}

/**
 * Work Items API types
 */
export interface CreateWorkItemInput {
  title: string;
  type: string;
  description: string;
  status?: WorkItem['status'];
}

export type UpdateWorkItemInput = Partial<CreateWorkItemInput>;

export interface WorkItemListResponse {
  items: WorkItem[];
}

/**
 * Workers API types
 */
export interface SpawnWorkerInput {
  templateId: string;
}

export interface WorkerPoolResponse {
  workers: Worker[];
  activeCount: number;
  idleCount: number;
}

/**
 * Templates API types
 */
export interface Template {
  id: string;
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterTemplateInput {
  name: string;
  description: string;
}

export interface CloneTemplateInput {
  newName: string;
}

/**
 * Dashboard API types
 */
export interface DashboardStatsResponse {
  data: DashboardStats;
}

/**
 * WebSocket event types
 */
export type WebSocketEventType =
  | 'agent:state_changed'
  | 'agent:spawned'
  | 'agent:terminated'
  | 'work_item:created'
  | 'work_item:updated'
  | 'work_item:status_changed'
  | 'work_item:progress'
  | 'work_item:deleted'
  | 'metrics:updated'
  | 'error'
  | 'approval:required'
  | 'approval:resolved';

export interface WebSocketMessage {
  type: WebSocketEventType;
  timestamp: number;
  data?: Record<string, unknown>;
  channel?: string;
}
