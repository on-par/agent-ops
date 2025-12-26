/**
 * Zustand store for Workers page UI state
 * Manages filters, selections, and modal state
 *
 * SEPARATION OF CONCERNS:
 * - UI State (this store): filters, search, selection, modals
 * - Server State (React Query): CRUD operations, status transitions, polling
 *   See: frontend/src/hooks/use-workers.ts
 */

import { create } from 'zustand';
import type { WorkersUIState } from '../types/ui-state';

export const useWorkersUIStore = create<WorkersUIState>((set) => ({
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
