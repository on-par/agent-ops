/**
 * Zustand store for Agents page UI state
 * Manages filters, selections, and worker state
 */

import { create } from 'zustand';
import type { AgentsUIState } from '../types/ui-state';

export const useAgentsUIStore = create<AgentsUIState>((set) => ({
  // Initial state
  statusFilter: 'all',
  searchQuery: '',
  selectedWorkerId: null,
  isSpawnModalOpen: false,

  // Actions
  setStatusFilter: (status) => set({ statusFilter: status }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedWorker: (id) => set({ selectedWorkerId: id }),
  setSpawnModalOpen: (open) => set({ isSpawnModalOpen: open }),
}));
