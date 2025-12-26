/**
 * Unit tests for WorkItems UI Store
 * Tests follow AAA pattern (Arrange-Act-Assert)
 *
 * NOTE: This store manages UI state only. Server state (CRUD, transitions,
 * optimistic updates) is tested in frontend/src/hooks/use-work-items.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkItemsUIStore } from './work-items.store';

describe('useWorkItemsUIStore', () => {
  beforeEach(() => {
    // Reset store state between tests
    useWorkItemsUIStore.setState({
      statusFilter: 'all',
      typeFilter: 'all',
      priorityFilter: 'all',
      searchQuery: '',
      selectedWorkItemId: null,
      isCreateModalOpen: false,
      isEditModalOpen: false,
    });
  });

  describe('initial state', () => {
    it('should have statusFilter set to "all"', () => {
      const state = useWorkItemsUIStore.getState();
      expect(state.statusFilter).toBe('all');
    });

    it('should have typeFilter set to "all"', () => {
      const state = useWorkItemsUIStore.getState();
      expect(state.typeFilter).toBe('all');
    });

    it('should have priorityFilter set to "all"', () => {
      const state = useWorkItemsUIStore.getState();
      expect(state.priorityFilter).toBe('all');
    });

    it('should have searchQuery set to empty string', () => {
      const state = useWorkItemsUIStore.getState();
      expect(state.searchQuery).toBe('');
    });

    it('should have selectedWorkItemId set to null', () => {
      const state = useWorkItemsUIStore.getState();
      expect(state.selectedWorkItemId).toBe(null);
    });

    it('should have isCreateModalOpen set to false', () => {
      const state = useWorkItemsUIStore.getState();
      expect(state.isCreateModalOpen).toBe(false);
    });

    it('should have isEditModalOpen set to false', () => {
      const state = useWorkItemsUIStore.getState();
      expect(state.isEditModalOpen).toBe(false);
    });
  });

  describe('setStatusFilter', () => {
    it('should update statusFilter to specific status', () => {
      const store = useWorkItemsUIStore.getState();
      store.setStatusFilter('in_progress');
      expect(useWorkItemsUIStore.getState().statusFilter).toBe('in_progress');
    });

    it('should update statusFilter back to "all"', () => {
      useWorkItemsUIStore.getState().setStatusFilter('done');
      useWorkItemsUIStore.getState().setStatusFilter('all');
      expect(useWorkItemsUIStore.getState().statusFilter).toBe('all');
    });
  });

  describe('setTypeFilter', () => {
    it('should update typeFilter to specific type', () => {
      const store = useWorkItemsUIStore.getState();
      store.setTypeFilter('bug');
      expect(useWorkItemsUIStore.getState().typeFilter).toBe('bug');
    });

    it('should update typeFilter back to "all"', () => {
      useWorkItemsUIStore.getState().setTypeFilter('feature');
      useWorkItemsUIStore.getState().setTypeFilter('all');
      expect(useWorkItemsUIStore.getState().typeFilter).toBe('all');
    });
  });

  describe('setPriorityFilter', () => {
    it('should update priorityFilter to specific priority', () => {
      const store = useWorkItemsUIStore.getState();
      store.setPriorityFilter('high');
      expect(useWorkItemsUIStore.getState().priorityFilter).toBe('high');
    });

    it('should update priorityFilter back to "all"', () => {
      useWorkItemsUIStore.getState().setPriorityFilter('critical');
      useWorkItemsUIStore.getState().setPriorityFilter('all');
      expect(useWorkItemsUIStore.getState().priorityFilter).toBe('all');
    });
  });

  describe('setSearchQuery', () => {
    it('should update searchQuery', () => {
      const store = useWorkItemsUIStore.getState();
      store.setSearchQuery('test query');
      expect(useWorkItemsUIStore.getState().searchQuery).toBe('test query');
    });

    it('should handle empty search query', () => {
      useWorkItemsUIStore.getState().setSearchQuery('something');
      useWorkItemsUIStore.getState().setSearchQuery('');
      expect(useWorkItemsUIStore.getState().searchQuery).toBe('');
    });
  });

  describe('setSelectedWorkItem', () => {
    it('should update selectedWorkItemId with valid ID', () => {
      const store = useWorkItemsUIStore.getState();
      store.setSelectedWorkItem('work-item-123');
      expect(useWorkItemsUIStore.getState().selectedWorkItemId).toBe('work-item-123');
    });

    it('should clear selectedWorkItemId with null', () => {
      useWorkItemsUIStore.getState().setSelectedWorkItem('work-item-123');
      useWorkItemsUIStore.getState().setSelectedWorkItem(null);
      expect(useWorkItemsUIStore.getState().selectedWorkItemId).toBe(null);
    });
  });

  describe('setCreateModalOpen', () => {
    it('should set isCreateModalOpen to true', () => {
      const store = useWorkItemsUIStore.getState();
      store.setCreateModalOpen(true);
      expect(useWorkItemsUIStore.getState().isCreateModalOpen).toBe(true);
    });

    it('should set isCreateModalOpen to false', () => {
      useWorkItemsUIStore.getState().setCreateModalOpen(true);
      useWorkItemsUIStore.getState().setCreateModalOpen(false);
      expect(useWorkItemsUIStore.getState().isCreateModalOpen).toBe(false);
    });
  });

  describe('setEditModalOpen', () => {
    it('should set isEditModalOpen to true', () => {
      const store = useWorkItemsUIStore.getState();
      store.setEditModalOpen(true);
      expect(useWorkItemsUIStore.getState().isEditModalOpen).toBe(true);
    });

    it('should set isEditModalOpen to false', () => {
      useWorkItemsUIStore.getState().setEditModalOpen(true);
      useWorkItemsUIStore.getState().setEditModalOpen(false);
      expect(useWorkItemsUIStore.getState().isEditModalOpen).toBe(false);
    });
  });

  describe('state isolation', () => {
    it('should not affect other state when updating one property', () => {
      const initialState = useWorkItemsUIStore.getState();
      useWorkItemsUIStore.getState().setStatusFilter('done');
      const newState = useWorkItemsUIStore.getState();
      expect(newState.typeFilter).toBe(initialState.typeFilter);
      expect(newState.priorityFilter).toBe(initialState.priorityFilter);
      expect(newState.searchQuery).toBe(initialState.searchQuery);
      expect(newState.selectedWorkItemId).toBe(initialState.selectedWorkItemId);
      expect(newState.isCreateModalOpen).toBe(initialState.isCreateModalOpen);
      expect(newState.isEditModalOpen).toBe(initialState.isEditModalOpen);
    });

    it('should handle multiple rapid state updates', () => {
      const store = useWorkItemsUIStore.getState();
      store.setStatusFilter('backlog');
      store.setTypeFilter('bug');
      store.setPriorityFilter('critical');
      store.setSearchQuery('urgent fix');
      store.setSelectedWorkItem('item-1');
      store.setCreateModalOpen(true);

      const state = useWorkItemsUIStore.getState();
      expect(state.statusFilter).toBe('backlog');
      expect(state.typeFilter).toBe('bug');
      expect(state.priorityFilter).toBe('critical');
      expect(state.searchQuery).toBe('urgent fix');
      expect(state.selectedWorkItemId).toBe('item-1');
      expect(state.isCreateModalOpen).toBe(true);
    });
  });
});
