/**
 * Zustand store for Templates page UI state
 * Manages search, selection, and modal states
 *
 * SEPARATION OF CONCERNS:
 * - UI State (this store): search, selection, modals
 * - Server State (React Query): CRUD operations, caching, invalidation
 *   See: frontend/src/hooks/use-templates.ts
 */

import { create } from 'zustand';
import type { TemplatesUIState } from '../types/ui-state';

export const useTemplatesUIStore = create<TemplatesUIState>((set) => ({
  // Initial state
  searchQuery: '',
  selectedTemplateId: null,
  isCreateModalOpen: false,
  isEditModalOpen: false,
  isCloneModalOpen: false,

  // Actions
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedTemplate: (id) => set({ selectedTemplateId: id }),
  setCreateModalOpen: (open) => set({ isCreateModalOpen: open }),
  setEditModalOpen: (open) => set({ isEditModalOpen: open }),
  setCloneModalOpen: (open) => set({ isCloneModalOpen: open }),
}));
