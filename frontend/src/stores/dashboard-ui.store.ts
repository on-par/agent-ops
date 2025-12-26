/**
 * Zustand store for Dashboard page UI state
 * Manages time period selection and refresh settings
 */

import { create } from 'zustand';
import type { DashboardUIState } from '../types/ui-state';

export const useDashboardUIStore = create<DashboardUIState>((set) => ({
  // Initial state
  timePeriod: 'week',
  isAutoRefresh: true,

  // Actions
  setTimePeriod: (period) => set({ timePeriod: period }),
  setAutoRefresh: (enabled) => set({ isAutoRefresh: enabled }),
}));
