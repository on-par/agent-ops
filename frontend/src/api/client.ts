/**
 * Unified API Client for Agent Ops
 *
 * Provides typed methods for all backend endpoints organized by domain.
 * Built on top of axios-client.ts infrastructure.
 */

import { apiClient } from '../lib/axios-client';
import type {
  WorkItem,
  Worker,
  DashboardStats,
  WorkItemStatus,
} from '../types/dashboard';
import type {
  CreateWorkItemInput,
  UpdateWorkItemInput,
  Template,
  WorkerPoolResponse,
} from '../types/api';

// Date fields to parse in API responses
const DATE_FIELDS = [
  'createdAt',
  'updatedAt',
  'startedAt',
  'completedAt',
  'spawnedAt',
  'lastSyncAt',
];

/**
 * Build query string from optional parameters
 * Filters out undefined values
 */
export function buildQueryString(
  params?: Record<string, string | number | boolean | undefined>
): string {
  if (!params) return '';
  const filtered = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return filtered.length > 0 ? `?${filtered.join('&')}` : '';
}

/**
 * Recursively parse ISO date strings to Date objects
 */
export function parseDates<T>(data: T): T {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) {
    return data.map((item) => parseDates(item)) as T;
  }
  if (typeof data === 'object') {
    const result = { ...data } as Record<string, unknown>;
    for (const [key, value] of Object.entries(result)) {
      if (DATE_FIELDS.includes(key) && typeof value === 'string') {
        result[key] = new Date(value);
      } else if (typeof value === 'object') {
        result[key] = parseDates(value);
      }
    }
    return result as T;
  }
  return data;
}

/**
 * Unified API client with namespace organization
 */
export const api = {
  /**
   * Dashboard API methods
   */
  dashboard: {
    /**
     * Fetch dashboard statistics
     * @returns Dashboard statistics with repositories, agents, and work items
     */
    async getStats(): Promise<DashboardStats> {
      const data = await apiClient.get<DashboardStats>('/api/dashboard/stats');
      return parseDates(data);
    },

    /**
     * Get WebSocket URL for real-time updates
     * @returns WebSocket URL string (ws:// or wss://)
     */
    getWebSocketUrl(): string {
      const apiBase = new URL(
        import.meta.env.VITE_API_URL || 'http://localhost:3001'
      );
      const protocol = apiBase.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${apiBase.host}/api/dashboard/ws`;
    },
  },

  /**
   * Work Items API methods
   */
  workItems: {
    /**
     * Get all work items with optional filters
     * @param filters Optional filters for status and type
     * @returns Array of work items
     */
    async getAll(filters?: {
      status?: string;
      type?: string;
    }): Promise<WorkItem[]> {
      const query = buildQueryString(filters);
      const data = await apiClient.get<WorkItem[]>(`/api/work-items${query}`);
      return parseDates(data);
    },

    /**
     * Get a single work item by ID
     * @param id Work item ID
     * @returns Single work item
     */
    async getById(id: string): Promise<WorkItem> {
      const data = await apiClient.get<WorkItem>(`/api/work-items/${id}`);
      return parseDates(data);
    },

    /**
     * Create a new work item
     * @param data Work item creation input
     * @returns Created work item
     */
    async create(data: CreateWorkItemInput): Promise<WorkItem> {
      const result = await apiClient.post<WorkItem>('/api/work-items', data);
      return parseDates(result);
    },

    /**
     * Update an existing work item
     * @param id Work item ID
     * @param data Partial work item data to update
     * @returns Updated work item
     */
    async update(id: string, data: UpdateWorkItemInput): Promise<WorkItem> {
      const result = await apiClient.patch<WorkItem>(
        `/api/work-items/${id}`,
        data
      );
      return parseDates(result);
    },

    /**
     * Delete a work item
     * @param id Work item ID
     * @returns Void
     */
    async delete(id: string): Promise<void> {
      await apiClient.delete<void>(`/api/work-items/${id}`);
    },

    /**
     * Transition work item to a new status
     * @param id Work item ID
     * @param to New status
     * @returns Updated work item
     */
    async transition(id: string, to: WorkItemStatus): Promise<WorkItem> {
      const result = await apiClient.post<WorkItem>(
        `/api/work-items/${id}/transition`,
        { status: to }
      );
      return parseDates(result);
    },

    /**
     * Assign agent to work item with role
     * @param id Work item ID
     * @param role Agent role
     * @param agentId Optional agent ID
     * @returns Updated work item
     */
    async assign(
      id: string,
      role: string,
      agentId?: string
    ): Promise<WorkItem> {
      const result = await apiClient.post<WorkItem>(
        `/api/work-items/${id}/assign`,
        { role, agentId }
      );
      return parseDates(result);
    },

    /**
     * Add success criterion to work item
     * @param id Work item ID
     * @param description Criterion description
     * @param completed Optional completion status
     * @returns Updated work item
     */
    async addSuccessCriterion(
      id: string,
      description: string,
      completed?: boolean
    ): Promise<WorkItem> {
      const result = await apiClient.post<WorkItem>(
        `/api/work-items/${id}/success-criteria`,
        { description, completed }
      );
      return parseDates(result);
    },
  },

  /**
   * Templates API methods
   */
  templates: {
    /**
     * Get all templates
     * @returns Array of all templates
     */
    async getAll(): Promise<Template[]> {
      const data = await apiClient.get<Template[]>('/api/templates');
      return parseDates(data);
    },

    /**
     * Get a single template by ID
     * @param id Template ID
     * @returns Template
     */
    async getById(id: string): Promise<Template> {
      const data = await apiClient.get<Template>(`/api/templates/${id}`);
      return parseDates(data);
    },

    /**
     * Create a new template
     * @param data Template creation input
     * @returns Created template
     */
    async create(data: Record<string, unknown>): Promise<Template> {
      const result = await apiClient.post<Template>('/api/templates', data);
      return parseDates(result);
    },

    /**
     * Update an existing template
     * @param id Template ID
     * @param data Partial template data to update
     * @returns Updated template
     */
    async update(
      id: string,
      data: Record<string, unknown>
    ): Promise<Template> {
      const result = await apiClient.patch<Template>(
        `/api/templates/${id}`,
        data
      );
      return parseDates(result);
    },

    /**
     * Delete a template
     * @param id Template ID
     * @returns Void
     */
    async delete(id: string): Promise<void> {
      await apiClient.delete<void>(`/api/templates/${id}`);
    },

    /**
     * Get builtin templates
     * @returns Array of builtin templates
     */
    async getBuiltin(): Promise<Template[]> {
      const data = await apiClient.get<Template[]>('/api/templates/builtin');
      return parseDates(data);
    },

    /**
     * Get user-defined templates
     * @param userId User ID
     * @returns Array of user templates
     */
    async getUserDefined(userId: string): Promise<Template[]> {
      const query = buildQueryString({ userId });
      const data = await apiClient.get<Template[]>(
        `/api/templates/user-defined${query}`
      );
      return parseDates(data);
    },

    /**
     * Get templates by role
     * @param role Role name
     * @returns Array of templates for the role
     */
    async getByRole(role: string): Promise<Template[]> {
      const query = buildQueryString({ role });
      const data = await apiClient.get<Template[]>(
        `/api/templates/by-role${query}`
      );
      return parseDates(data);
    },

    /**
     * Get templates for work item type
     * @param type Work item type
     * @returns Array of templates for the type
     */
    async getForWorkItemType(type: string): Promise<Template[]> {
      const query = buildQueryString({ type });
      const data = await apiClient.get<Template[]>(
        `/api/templates/for-work-item-type${query}`
      );
      return parseDates(data);
    },

    /**
     * Clone a template
     * @param id Template ID to clone
     * @param newName Name for the cloned template
     * @param createdBy User creating the clone
     * @returns Cloned template
     */
    async clone(
      id: string,
      newName: string,
      createdBy: string
    ): Promise<Template> {
      const result = await apiClient.post<Template>(
        `/api/templates/${id}/clone`,
        { newName, createdBy }
      );
      return parseDates(result);
    },
  },

  /**
   * Workers API methods
   */
  workers: {
    /**
     * Get worker pool status
     * @returns Worker pool with workers and counts
     */
    async getPool(): Promise<WorkerPoolResponse> {
      const data = await apiClient.get<WorkerPoolResponse>('/api/workers');
      return parseDates(data);
    },

    /**
     * Spawn a new worker
     * @param templateId Template ID
     * @param sessionId Session ID
     * @returns New worker
     */
    async spawn(templateId: string, sessionId: string): Promise<Worker> {
      const result = await apiClient.post<Worker>('/api/workers/spawn', {
        templateId,
        sessionId,
      });
      return parseDates(result);
    },

    /**
     * Get available workers
     * @returns Array of available workers
     */
    async getAvailable(): Promise<Worker[]> {
      const data = await apiClient.get<Worker[]>('/api/workers/available');
      return parseDates(data);
    },

    /**
     * Get workers by template
     * @param templateId Template ID
     * @returns Array of workers for the template
     */
    async getByTemplate(templateId: string): Promise<Worker[]> {
      const query = buildQueryString({ templateId });
      const data = await apiClient.get<Worker[]>(
        `/api/workers/by-template${query}`
      );
      return parseDates(data);
    },

    /**
     * Terminate a worker
     * @param id Worker ID
     * @returns Terminated worker
     */
    async terminate(id: string): Promise<Worker> {
      const result = await apiClient.post<Worker>(
        `/api/workers/${id}/terminate`,
        {}
      );
      return parseDates(result);
    },

    /**
     * Pause a worker
     * @param id Worker ID
     * @returns Paused worker
     */
    async pause(id: string): Promise<Worker> {
      const result = await apiClient.post<Worker>(
        `/api/workers/${id}/pause`,
        {}
      );
      return parseDates(result);
    },

    /**
     * Resume a paused worker
     * @param id Worker ID
     * @returns Resumed worker
     */
    async resume(id: string): Promise<Worker> {
      const result = await apiClient.post<Worker>(
        `/api/workers/${id}/resume`,
        {}
      );
      return parseDates(result);
    },

    /**
     * Inject message into worker
     * @param id Worker ID
     * @param message Message to inject
     * @param type Optional message type
     * @param payload Optional message payload
     * @returns Injection result
     */
    async inject(
      id: string,
      message: string,
      type?: string,
      payload?: unknown
    ): Promise<Record<string, unknown>> {
      const result = await apiClient.post<Record<string, unknown>>(
        `/api/workers/${id}/inject`,
        { message, type, payload }
      );
      return parseDates(result);
    },

    /**
     * Assign worker to work item
     * @param id Worker ID
     * @param workItemId Work item ID
     * @param role Role for the assignment
     * @returns Updated worker
     */
    async assign(
      id: string,
      workItemId: string,
      role: string
    ): Promise<Worker> {
      const result = await apiClient.post<Worker>(
        `/api/workers/${id}/assign`,
        { workItemId, role }
      );
      return parseDates(result);
    },

    /**
     * Mark worker as complete
     * @param id Worker ID
     * @returns Completed worker
     */
    async complete(id: string): Promise<Worker> {
      const result = await apiClient.post<Worker>(
        `/api/workers/${id}/complete`,
        {}
      );
      return parseDates(result);
    },

    /**
     * Update worker metrics
     * @param id Worker ID
     * @param metrics Metrics to update
     * @returns Updated worker
     */
    async updateMetrics(
      id: string,
      metrics: Record<string, unknown>
    ): Promise<Worker> {
      const result = await apiClient.patch<Worker>(
        `/api/workers/${id}/metrics`,
        metrics
      );
      return parseDates(result);
    },

    /**
     * Report worker error
     * @param id Worker ID
     * @param error Error message
     * @returns Updated worker
     */
    async reportError(id: string, error: string): Promise<Worker> {
      const result = await apiClient.post<Worker>(
        `/api/workers/${id}/error`,
        { error }
      );
      return parseDates(result);
    },
  },

  /**
   * Metrics API methods
   */
  metrics: {
    /**
     * Get agent metrics
     * @param params Optional filter parameters
     * @returns Agent metrics
     */
    async getAgents(
      params?: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
      const query = buildQueryString(params as Record<string, string | number | boolean | undefined>);
      const data = await apiClient.get<Record<string, unknown>>(
        `/api/metrics/agents${query}`
      );
      return parseDates(data);
    },

    /**
     * Get work metrics
     * @param params Optional filter parameters
     * @returns Work metrics
     */
    async getWork(
      params?: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
      const query = buildQueryString(params as Record<string, string | number | boolean | undefined>);
      const data = await apiClient.get<Record<string, unknown>>(
        `/api/metrics/work${query}`
      );
      return parseDates(data);
    },

    /**
     * Get system metrics
     * @returns System metrics
     */
    async getSystem(): Promise<Record<string, unknown>> {
      const data = await apiClient.get<Record<string, unknown>>(
        '/api/metrics/system'
      );
      return parseDates(data);
    },
  },

  /**
   * Config API methods (Provider Settings)
   */
  config: {
    /**
     * Get all provider settings
     * @returns Array of provider settings
     */
    async getAll(): Promise<Record<string, unknown>[]> {
      const data = await apiClient.get<Record<string, unknown>[]>(
        '/api/provider-settings'
      );
      return parseDates(data);
    },

    /**
     * Get provider setting by ID
     * @param id Setting ID
     * @returns Provider setting
     */
    async getById(id: string): Promise<Record<string, unknown>> {
      const data = await apiClient.get<Record<string, unknown>>(
        `/api/provider-settings/${id}`
      );
      return parseDates(data);
    },

    /**
     * Create provider setting
     * @param data Setting creation input
     * @returns Created setting
     */
    async create(data: Record<string, unknown>): Promise<Record<string, unknown>> {
      const result = await apiClient.post<Record<string, unknown>>(
        '/api/provider-settings',
        data
      );
      return parseDates(result);
    },

    /**
     * Update provider setting
     * @param id Setting ID
     * @param data Partial setting data to update
     * @returns Updated setting
     */
    async update(
      id: string,
      data: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
      const result = await apiClient.put<Record<string, unknown>>(
        `/api/provider-settings/${id}`,
        data
      );
      return parseDates(result);
    },

    /**
     * Delete provider setting
     * @param id Setting ID
     * @returns Success response
     */
    async delete(id: string): Promise<{ success: true }> {
      const result = await apiClient.delete<{ success: true }>(
        `/api/provider-settings/${id}`
      );
      return result;
    },

    /**
     * Test provider connection
     * @param params Connection test parameters
     * @returns Test result
     */
    async testConnection(
      params: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
      const result = await apiClient.post<Record<string, unknown>>(
        '/api/provider-settings/test-connection',
        params
      );
      return parseDates(result);
    },

    /**
     * Get available models for provider
     * @param providerType Provider type
     * @param params Optional parameters
     * @returns Array of available models
     */
    async getModels(
      providerType: string,
      params?: Record<string, unknown>
    ): Promise<Record<string, unknown>[]> {
      const query = buildQueryString(params as Record<string, string | number | boolean | undefined>);
      const data = await apiClient.get<Record<string, unknown>[]>(
        `/api/provider-settings/models/${providerType}${query}`
      );
      return parseDates(data);
    },

    /**
     * Set provider as default
     * @param id Setting ID
     * @returns Updated setting
     */
    async setDefault(id: string): Promise<Record<string, unknown>> {
      const result = await apiClient.post<Record<string, unknown>>(
        `/api/provider-settings/${id}/set-default`,
        {}
      );
      return parseDates(result);
    },
  },
};

export default api;
