import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkItemStore } from '../../stores/workItemStore';

describe('workItemStore', () => {
  beforeEach(() => {
    // Reset store before each test
    const { result } = renderHook(() => useWorkItemStore());
    act(() => {
      result.current.setItems([]);
      result.current.clearError();
      result.current.setLoading(false);
    });
  });

  describe('Initial State', () => {
    it('should have empty items array initially', () => {
      const { result } = renderHook(() => useWorkItemStore());
      expect(result.current.items).toEqual([]);
    });

    it('should not be loading initially', () => {
      const { result } = renderHook(() => useWorkItemStore());
      expect(result.current.loading).toBe(false);
    });

    it('should have no error initially', () => {
      const { result } = renderHook(() => useWorkItemStore());
      expect(result.current.error).toBeNull();
    });
  });

  describe('addItem', () => {
    it('should add a new work item', () => {
      const { result } = renderHook(() => useWorkItemStore());

      act(() => {
        result.current.addItem({
          title: 'Test Task',
          description: 'Test Description',
          status: 'PENDING',
          priority: 'high',
        });
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].title).toBe('Test Task');
      expect(result.current.items[0].status).toBe('PENDING');
      expect(result.current.items[0].priority).toBe('high');
    });

    it('should generate unique ID for new items', () => {
      const { result } = renderHook(() => useWorkItemStore());

      act(() => {
        result.current.addItem({
          title: 'Task 1',
          status: 'PENDING',
          priority: 'medium',
        });
        result.current.addItem({
          title: 'Task 2',
          status: 'PENDING',
          priority: 'low',
        });
      });

      expect(result.current.items[0].id).not.toBe(result.current.items[1].id);
    });

    it('should set createdAt timestamp', () => {
      const { result } = renderHook(() => useWorkItemStore());
      const beforeTime = new Date().toISOString();

      act(() => {
        result.current.addItem({
          title: 'Test Task',
          status: 'PENDING',
          priority: 'medium',
        });
      });

      const afterTime = new Date().toISOString();
      const createdAt = result.current.items[0].createdAt;

      expect(createdAt).toBeDefined();
      expect(createdAt >= beforeTime).toBe(true);
      expect(createdAt <= afterTime).toBe(true);
    });
  });

  describe('updateItem', () => {
    it('should update an existing work item', () => {
      const { result } = renderHook(() => useWorkItemStore());

      act(() => {
        result.current.addItem({
          title: 'Original Title',
          status: 'PENDING',
          priority: 'low',
        });
      });

      const itemId = result.current.items[0].id;

      act(() => {
        result.current.updateItem(itemId, {
          title: 'Updated Title',
          status: 'IN_PROGRESS',
        });
      });

      expect(result.current.items[0].title).toBe('Updated Title');
      expect(result.current.items[0].status).toBe('IN_PROGRESS');
      expect(result.current.items[0].priority).toBe('low'); // Unchanged
    });

    it('should set updatedAt timestamp', () => {
      const { result } = renderHook(() => useWorkItemStore());

      act(() => {
        result.current.addItem({
          title: 'Test Task',
          status: 'PENDING',
          priority: 'medium',
        });
      });

      const itemId = result.current.items[0].id;

      act(() => {
        result.current.updateItem(itemId, { status: 'COMPLETED' });
      });

      expect(result.current.items[0].updatedAt).toBeDefined();
    });

    it('should not update non-existent items', () => {
      const { result } = renderHook(() => useWorkItemStore());

      act(() => {
        result.current.addItem({
          title: 'Test Task',
          status: 'PENDING',
          priority: 'medium',
        });
      });

      act(() => {
        result.current.updateItem('non-existent-id', {
          status: 'COMPLETED',
        });
      });

      expect(result.current.items[0].status).toBe('PENDING');
    });
  });

  describe('deleteItem', () => {
    it('should delete a work item', () => {
      const { result } = renderHook(() => useWorkItemStore());

      act(() => {
        result.current.addItem({
          title: 'Task to Delete',
          status: 'PENDING',
          priority: 'low',
        });
      });

      const itemId = result.current.items[0].id;

      act(() => {
        result.current.deleteItem(itemId);
      });

      expect(result.current.items).toHaveLength(0);
    });

    it('should only delete the specified item', () => {
      const { result } = renderHook(() => useWorkItemStore());

      act(() => {
        result.current.addItem({
          title: 'Task 1',
          status: 'PENDING',
          priority: 'medium',
        });
        result.current.addItem({
          title: 'Task 2',
          status: 'PENDING',
          priority: 'high',
        });
      });

      const firstItemId = result.current.items[0].id;

      act(() => {
        result.current.deleteItem(firstItemId);
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].title).toBe('Task 2');
    });
  });

  describe('setItems', () => {
    it('should replace all items', () => {
      const { result } = renderHook(() => useWorkItemStore());

      const newItems = [
        {
          id: '1',
          title: 'Item 1',
          status: 'PENDING' as const,
          priority: 'high' as const,
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          title: 'Item 2',
          status: 'COMPLETED' as const,
          priority: 'low' as const,
          createdAt: new Date().toISOString(),
        },
      ];

      act(() => {
        result.current.setItems(newItems);
      });

      expect(result.current.items).toEqual(newItems);
    });
  });

  describe('Loading State', () => {
    it('should set loading state', () => {
      const { result } = renderHook(() => useWorkItemStore());

      act(() => {
        result.current.setLoading(true);
      });

      expect(result.current.loading).toBe(true);

      act(() => {
        result.current.setLoading(false);
      });

      expect(result.current.loading).toBe(false);
    });
  });

  describe('Error State', () => {
    it('should set error message', () => {
      const { result } = renderHook(() => useWorkItemStore());

      act(() => {
        result.current.setError('Something went wrong');
      });

      expect(result.current.error).toBe('Something went wrong');
    });

    it('should clear error', () => {
      const { result } = renderHook(() => useWorkItemStore());

      act(() => {
        result.current.setError('Error message');
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });
});
