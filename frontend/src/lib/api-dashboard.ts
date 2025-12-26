/**
 * Dashboard API endpoints
 * Handles dashboard statistics and real-time updates
 */

import { apiClient } from './axios-client';
import type { DashboardStats } from '../types/dashboard';

export const dashboardApi = {
  /**
   * Get dashboard statistics
   */
  getStats: (): Promise<DashboardStats> => {
    return apiClient.get<DashboardStats>('/api/dashboard/stats');
  },

  /**
   * Get WebSocket URL for real-time updates
   */
  getWebSocketUrl: (): string => {
    const apiBase = new URL(import.meta.env.VITE_API_URL || 'http://localhost:3001');
    const protocol = apiBase.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${apiBase.host}/api/dashboard/ws`;
  },
};
