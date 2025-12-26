/**
 * Workers API endpoints
 * Handles all worker/agent related API calls
 */

import { apiClient } from './axios-client';
import type { Worker } from '../types/dashboard';
import type { SpawnWorkerInput } from '../types/api';

export const workersApi = {
  /**
   * Get all workers in the pool
   */
  getPool: (): Promise<Worker[]> => {
    return apiClient.get<Worker[]>('/api/workers');
  },

  /**
   * Get a single worker by ID
   */
  getById: (id: string): Promise<Worker> => {
    return apiClient.get<Worker>(`/api/workers/${id}`);
  },

  /**
   * Spawn a new worker from a template
   */
  spawn: (data: SpawnWorkerInput): Promise<Worker> => {
    return apiClient.post<Worker>('/api/workers/spawn', data);
  },

  /**
   * Pause a worker
   */
  pause: (id: string): Promise<Worker> => {
    return apiClient.post<Worker>(`/api/workers/${id}/pause`, {});
  },

  /**
   * Resume a paused worker
   */
  resume: (id: string): Promise<Worker> => {
    return apiClient.post<Worker>(`/api/workers/${id}/resume`, {});
  },

  /**
   * Terminate a worker
   */
  terminate: (id: string): Promise<void> => {
    return apiClient.post<void>(`/api/workers/${id}/terminate`, {});
  },
};
