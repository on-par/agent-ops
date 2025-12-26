/**
 * Zustand store for Kanban page UI state
 * Manages filters, selections, and drag-and-drop state
 */

import { create } from 'zustand';
import type { KanbanUIState } from '../types/ui-state';

export const useKanbanUIStore = create<KanbanUIState>((set) => ({
  // Initial state
  statusFilter: 'all',
  searchQuery: '',
  draggedItemId: null,
  dropTargetColumnId: null,
  selectedWorkItemId: null,
  isCreateModalOpen: false,
  isEditModalOpen: false,

  // Actions
  setStatusFilter: (status) => set({ statusFilter: status }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setDraggedItem: (id) => set({ draggedItemId: id }),
  setDropTarget: (columnId) => set({ dropTargetColumnId: columnId }),
  setSelectedWorkItem: (id) => set({ selectedWorkItemId: id }),
  setCreateModalOpen: (open) => set({ isCreateModalOpen: open }),
  setEditModalOpen: (open) => set({ isEditModalOpen: open }),
}));
