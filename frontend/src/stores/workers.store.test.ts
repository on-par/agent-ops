/**
 * Unit tests for Workers UI Store
 * Tests follow AAA pattern (Arrange-Act-Assert)
 *
 * NOTE: This store manages UI state only. Server state (CRUD, status transitions,
 * polling) is managed by React Query hooks in frontend/src/hooks/use-workers.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkersUIStore } from './workers.store';

describe('useWorkersUIStore', () => {
  beforeEach(() => {
    // Reset store state between tests
    useWorkersUIStore.setState({
      statusFilter: 'all',
      searchQuery: '',
      selectedWorkerId: null,
      isSpawnModalOpen: false,
    });
  });

  describe('initial state', () => {
    it('should have statusFilter set to "all"', () => {
      const state = useWorkersUIStore.getState();
      expect(state.statusFilter).toBe('all');
    });

    it('should have searchQuery set to empty string', () => {
      const state = useWorkersUIStore.getState();
      expect(state.searchQuery).toBe('');
    });

    it('should have selectedWorkerId set to null', () => {
      const state = useWorkersUIStore.getState();
      expect(state.selectedWorkerId).toBe(null);
    });

    it('should have isSpawnModalOpen set to false', () => {
      const state = useWorkersUIStore.getState();
      expect(state.isSpawnModalOpen).toBe(false);
    });
  });

  describe('setStatusFilter', () => {
    it('should update statusFilter to specific status', () => {
      const store = useWorkersUIStore.getState();
      store.setStatusFilter('working');
      expect(useWorkersUIStore.getState().statusFilter).toBe('working');
    });

    it('should update statusFilter back to "all"', () => {
      useWorkersUIStore.getState().setStatusFilter('idle');
      useWorkersUIStore.getState().setStatusFilter('all');
      expect(useWorkersUIStore.getState().statusFilter).toBe('all');
    });

    it('should handle all valid worker statuses', () => {
      const statuses = ['idle', 'working', 'paused', 'error', 'terminated'] as const;
      for (const status of statuses) {
        useWorkersUIStore.getState().setStatusFilter(status);
        expect(useWorkersUIStore.getState().statusFilter).toBe(status);
      }
    });
  });

  describe('setSearchQuery', () => {
    it('should update searchQuery', () => {
      const store = useWorkersUIStore.getState();
      store.setSearchQuery('test agent');
      expect(useWorkersUIStore.getState().searchQuery).toBe('test agent');
    });

    it('should handle empty search query', () => {
      useWorkersUIStore.getState().setSearchQuery('something');
      useWorkersUIStore.getState().setSearchQuery('');
      expect(useWorkersUIStore.getState().searchQuery).toBe('');
    });

    it('should handle special characters in search query', () => {
      const store = useWorkersUIStore.getState();
      store.setSearchQuery('agent@test.com');
      expect(useWorkersUIStore.getState().searchQuery).toBe('agent@test.com');
    });
  });

  describe('setSelectedWorker', () => {
    it('should update selectedWorkerId with valid ID', () => {
      const store = useWorkersUIStore.getState();
      store.setSelectedWorker('worker-123');
      expect(useWorkersUIStore.getState().selectedWorkerId).toBe('worker-123');
    });

    it('should clear selectedWorkerId with null', () => {
      useWorkersUIStore.getState().setSelectedWorker('worker-123');
      useWorkersUIStore.getState().setSelectedWorker(null);
      expect(useWorkersUIStore.getState().selectedWorkerId).toBe(null);
    });

    it('should replace existing selection with new ID', () => {
      useWorkersUIStore.getState().setSelectedWorker('worker-1');
      useWorkersUIStore.getState().setSelectedWorker('worker-2');
      expect(useWorkersUIStore.getState().selectedWorkerId).toBe('worker-2');
    });
  });

  describe('setSpawnModalOpen', () => {
    it('should set isSpawnModalOpen to true', () => {
      const store = useWorkersUIStore.getState();
      store.setSpawnModalOpen(true);
      expect(useWorkersUIStore.getState().isSpawnModalOpen).toBe(true);
    });

    it('should set isSpawnModalOpen to false', () => {
      useWorkersUIStore.getState().setSpawnModalOpen(true);
      useWorkersUIStore.getState().setSpawnModalOpen(false);
      expect(useWorkersUIStore.getState().isSpawnModalOpen).toBe(false);
    });
  });

  describe('state isolation', () => {
    it('should not affect other state when updating statusFilter', () => {
      const initialState = useWorkersUIStore.getState();
      useWorkersUIStore.getState().setStatusFilter('working');
      const newState = useWorkersUIStore.getState();
      expect(newState.searchQuery).toBe(initialState.searchQuery);
      expect(newState.selectedWorkerId).toBe(initialState.selectedWorkerId);
      expect(newState.isSpawnModalOpen).toBe(initialState.isSpawnModalOpen);
    });

    it('should not affect other state when updating searchQuery', () => {
      useWorkersUIStore.getState().setStatusFilter('idle');
      const stateBeforeSearch = useWorkersUIStore.getState();
      useWorkersUIStore.getState().setSearchQuery('test');
      const newState = useWorkersUIStore.getState();
      expect(newState.statusFilter).toBe(stateBeforeSearch.statusFilter);
      expect(newState.selectedWorkerId).toBe(stateBeforeSearch.selectedWorkerId);
      expect(newState.isSpawnModalOpen).toBe(stateBeforeSearch.isSpawnModalOpen);
    });

    it('should handle multiple rapid state updates', () => {
      const store = useWorkersUIStore.getState();
      store.setStatusFilter('working');
      store.setSearchQuery('code-reviewer');
      store.setSelectedWorker('worker-42');
      store.setSpawnModalOpen(true);

      const state = useWorkersUIStore.getState();
      expect(state.statusFilter).toBe('working');
      expect(state.searchQuery).toBe('code-reviewer');
      expect(state.selectedWorkerId).toBe('worker-42');
      expect(state.isSpawnModalOpen).toBe(true);
    });
  });
});
