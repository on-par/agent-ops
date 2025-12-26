/**
 * Work Items API endpoints
 * Handles all work item related API calls
 */

import { apiClient } from './axios-client';
import type { WorkItem } from '../types/dashboard';
import type { CreateWorkItemInput, UpdateWorkItemInput } from '../types/api';

export const workItemsApi = {
  /**
   * Get all work items with optional filters
   */
  getAll: (filters?: { status?: string }): Promise<WorkItem[]> => {
    const params = new URLSearchParams();
    if (filters?.status) {
      params.append('status', filters.status);
    }
    const query = params.toString();
    return apiClient.get<WorkItem[]>(`/api/work-items${query ? `?${query}` : ''}`);
  },

  /**
   * Get a single work item by ID
   */
  getById: (id: string): Promise<WorkItem> => {
    return apiClient.get<WorkItem>(`/api/work-items/${id}`);
  },

  /**
   * Create a new work item
   */
  create: (data: CreateWorkItemInput): Promise<WorkItem> => {
    return apiClient.post<WorkItem>('/api/work-items', data);
  },

  /**
   * Update an existing work item
   */
  update: (id: string, data: UpdateWorkItemInput): Promise<WorkItem> => {
    return apiClient.patch<WorkItem>(`/api/work-items/${id}`, data);
  },

  /**
   * Delete a work item
   */
  delete: (id: string): Promise<void> => {
    return apiClient.delete<void>(`/api/work-items/${id}`);
  },

  /**
   * Transition work item to a different status
   */
  transition: (id: string, to: string): Promise<WorkItem> => {
    return apiClient.post<WorkItem>(`/api/work-items/${id}/transition`, { to });
  },
};
