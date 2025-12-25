/**
 * Unit tests for Templates UI Store
 * Tests follow AAA pattern (Arrange-Act-Assert)
 *
 * NOTE: This store manages UI state only. Server state (CRUD operations)
 * is managed by React Query hooks in frontend/src/hooks/use-templates.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useTemplatesUIStore } from './templates.store';

describe('useTemplatesUIStore', () => {
  beforeEach(() => {
    // Reset store state between tests
    useTemplatesUIStore.setState({
      searchQuery: '',
      selectedTemplateId: null,
      isCreateModalOpen: false,
      isEditModalOpen: false,
      isCloneModalOpen: false,
    });
  });

  describe('initial state', () => {
    it('should have searchQuery set to empty string', () => {
      const state = useTemplatesUIStore.getState();
      expect(state.searchQuery).toBe('');
    });

    it('should have selectedTemplateId set to null', () => {
      const state = useTemplatesUIStore.getState();
      expect(state.selectedTemplateId).toBe(null);
    });

    it('should have isCreateModalOpen set to false', () => {
      const state = useTemplatesUIStore.getState();
      expect(state.isCreateModalOpen).toBe(false);
    });

    it('should have isEditModalOpen set to false', () => {
      const state = useTemplatesUIStore.getState();
      expect(state.isEditModalOpen).toBe(false);
    });

    it('should have isCloneModalOpen set to false', () => {
      const state = useTemplatesUIStore.getState();
      expect(state.isCloneModalOpen).toBe(false);
    });
  });

  describe('setSearchQuery', () => {
    it('should update searchQuery', () => {
      const store = useTemplatesUIStore.getState();
      store.setSearchQuery('react');
      expect(useTemplatesUIStore.getState().searchQuery).toBe('react');
    });

    it('should handle empty search query', () => {
      useTemplatesUIStore.getState().setSearchQuery('something');
      useTemplatesUIStore.getState().setSearchQuery('');
      expect(useTemplatesUIStore.getState().searchQuery).toBe('');
    });
  });

  describe('setSelectedTemplate', () => {
    it('should update selectedTemplateId with valid ID', () => {
      const store = useTemplatesUIStore.getState();
      store.setSelectedTemplate('template-123');
      expect(useTemplatesUIStore.getState().selectedTemplateId).toBe('template-123');
    });

    it('should clear selectedTemplateId with null', () => {
      useTemplatesUIStore.getState().setSelectedTemplate('template-123');
      useTemplatesUIStore.getState().setSelectedTemplate(null);
      expect(useTemplatesUIStore.getState().selectedTemplateId).toBe(null);
    });
  });

  describe('setCreateModalOpen', () => {
    it('should set isCreateModalOpen to true', () => {
      const store = useTemplatesUIStore.getState();
      store.setCreateModalOpen(true);
      expect(useTemplatesUIStore.getState().isCreateModalOpen).toBe(true);
    });

    it('should set isCreateModalOpen to false', () => {
      useTemplatesUIStore.getState().setCreateModalOpen(true);
      useTemplatesUIStore.getState().setCreateModalOpen(false);
      expect(useTemplatesUIStore.getState().isCreateModalOpen).toBe(false);
    });
  });

  describe('setEditModalOpen', () => {
    it('should set isEditModalOpen to true', () => {
      const store = useTemplatesUIStore.getState();
      store.setEditModalOpen(true);
      expect(useTemplatesUIStore.getState().isEditModalOpen).toBe(true);
    });

    it('should set isEditModalOpen to false', () => {
      useTemplatesUIStore.getState().setEditModalOpen(true);
      useTemplatesUIStore.getState().setEditModalOpen(false);
      expect(useTemplatesUIStore.getState().isEditModalOpen).toBe(false);
    });
  });

  describe('setCloneModalOpen', () => {
    it('should set isCloneModalOpen to true', () => {
      const store = useTemplatesUIStore.getState();
      store.setCloneModalOpen(true);
      expect(useTemplatesUIStore.getState().isCloneModalOpen).toBe(true);
    });

    it('should set isCloneModalOpen to false', () => {
      useTemplatesUIStore.getState().setCloneModalOpen(true);
      useTemplatesUIStore.getState().setCloneModalOpen(false);
      expect(useTemplatesUIStore.getState().isCloneModalOpen).toBe(false);
    });
  });

  describe('state isolation', () => {
    it('should not affect other state when updating searchQuery', () => {
      const initialState = useTemplatesUIStore.getState();
      useTemplatesUIStore.getState().setSearchQuery('react');
      const newState = useTemplatesUIStore.getState();
      expect(newState.selectedTemplateId).toBe(initialState.selectedTemplateId);
      expect(newState.isCreateModalOpen).toBe(initialState.isCreateModalOpen);
      expect(newState.isEditModalOpen).toBe(initialState.isEditModalOpen);
      expect(newState.isCloneModalOpen).toBe(initialState.isCloneModalOpen);
    });

    it('should not affect other state when updating selectedTemplateId', () => {
      useTemplatesUIStore.getState().setSearchQuery('test');
      const stateBeforeSelection = useTemplatesUIStore.getState();
      useTemplatesUIStore.getState().setSelectedTemplate('template-1');
      const newState = useTemplatesUIStore.getState();
      expect(newState.searchQuery).toBe(stateBeforeSelection.searchQuery);
      expect(newState.isCreateModalOpen).toBe(stateBeforeSelection.isCreateModalOpen);
      expect(newState.isEditModalOpen).toBe(stateBeforeSelection.isEditModalOpen);
      expect(newState.isCloneModalOpen).toBe(stateBeforeSelection.isCloneModalOpen);
    });

    it('should handle multiple rapid state updates correctly', () => {
      const store = useTemplatesUIStore.getState();
      store.setSearchQuery('vue');
      store.setSelectedTemplate('template-42');
      store.setCreateModalOpen(true);
      store.setEditModalOpen(false);
      store.setCloneModalOpen(true);

      const state = useTemplatesUIStore.getState();
      expect(state.searchQuery).toBe('vue');
      expect(state.selectedTemplateId).toBe('template-42');
      expect(state.isCreateModalOpen).toBe(true);
      expect(state.isEditModalOpen).toBe(false);
      expect(state.isCloneModalOpen).toBe(true);
    });
  });
});
