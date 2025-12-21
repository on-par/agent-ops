import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useWorkItems,
  useWorkItem,
  useCreateWorkItem,
  useUpdateWorkItem,
  useDeleteWorkItem,
} from '../../hooks/useWorkItems';

// Create a wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// Mock fetch globally
global.fetch = vi.fn();

describe('useWorkItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('useWorkItems', () => {
    it('should fetch all work items', async () => {
      const mockWorkItems = [
        {
          id: '1',
          title: 'Test Item 1',
          status: 'PENDING' as const,
          priority: 'high' as const,
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          title: 'Test Item 2',
          status: 'IN_PROGRESS' as const,
          priority: 'medium' as const,
          createdAt: new Date().toISOString(),
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockWorkItems,
      });

      const { result } = renderHook(() => useWorkItems(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockWorkItems);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/work-items'
      );
    });

    it('should handle fetch error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useWorkItems(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });
  });

  describe('useWorkItem', () => {
    it('should fetch a single work item', async () => {
      const mockWorkItem = {
        id: '1',
        title: 'Test Item',
        status: 'PENDING' as const,
        priority: 'high' as const,
        createdAt: new Date().toISOString(),
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockWorkItem,
      });

      const { result } = renderHook(() => useWorkItem('1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockWorkItem);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/work-items/1'
      );
    });

    it('should not fetch if id is empty', () => {
      const { result } = renderHook(() => useWorkItem(''), {
        wrapper: createWrapper(),
      });

      expect(result.current.isFetching).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('useCreateWorkItem', () => {
    it('should create a work item', async () => {
      const newItem = {
        title: 'New Item',
        description: 'Test description',
        priority: 'medium' as const,
      };

      const createdItem = {
        id: '3',
        ...newItem,
        status: 'PENDING' as const,
        createdAt: new Date().toISOString(),
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => createdItem,
      });

      const { result } = renderHook(() => useCreateWorkItem(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(newItem);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(createdItem);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/work-items',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newItem),
        })
      );
    });

    it('should handle creation error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      const { result } = renderHook(() => useCreateWorkItem(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        title: 'New Item',
        priority: 'low' as const,
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });
  });

  describe('useUpdateWorkItem', () => {
    it('should update a work item', async () => {
      const updates = {
        title: 'Updated Title',
        status: 'COMPLETED' as const,
      };

      const updatedItem = {
        id: '1',
        ...updates,
        priority: 'high' as const,
        createdAt: new Date().toISOString(),
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => updatedItem,
      });

      const { result } = renderHook(() => useUpdateWorkItem(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: '1', data: updates });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(updatedItem);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/work-items/1',
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })
      );
    });
  });

  describe('useDeleteWorkItem', () => {
    it('should delete a work item', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
      });

      const { result } = renderHook(() => useDeleteWorkItem(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('1');

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/work-items/1',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('should handle deletion error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const { result } = renderHook(() => useDeleteWorkItem(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('non-existent-id');

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });
  });
});
