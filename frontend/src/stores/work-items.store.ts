/**
 * Zustand store for Work Items page UI state
 * Manages filters, selections, and modal states
 *
 * SEPARATION OF CONCERNS:
 * - UI State (this store): filters, search, selection, modals
 * - Server State (React Query): CRUD operations, status transitions, optimistic updates
 *   See: frontend/src/hooks/use-work-items.ts
 */

import { create } from 'zustand';
import type { WorkItemsUIState } from '../types/ui-state';

export const useWorkItemsUIStore = create<WorkItemsUIState>((set) => ({
  // Initial state - Filters
  statusFilter: 'all',
  typeFilter: 'all',
  priorityFilter: 'all',
  searchQuery: '',

  // Initial state - Selection
  selectedWorkItemId: null,

  // Initial state - Modals
  isCreateModalOpen: false,
  isEditModalOpen: false,

  // Actions
  setStatusFilter: (status) => set({ statusFilter: status }),
  setTypeFilter: (type) => set({ typeFilter: type }),
  setPriorityFilter: (priority) => set({ priorityFilter: priority }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedWorkItem: (id) => set({ selectedWorkItemId: id }),
  setCreateModalOpen: (open) => set({ isCreateModalOpen: open }),
  setEditModalOpen: (open) => set({ isEditModalOpen: open }),
}));
