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
      const now = Date.now();
      const mockApiResponse = [
        {
          id: '1',
          title: 'Test Item 1',
          status: 'PENDING' as const,
          priority: 'high' as const,
          createdAt: now,
        },
        {
          id: '2',
          title: 'Test Item 2',
          status: 'IN_PROGRESS' as const,
          priority: 'medium' as const,
          createdAt: now,
        },
      ];

      const expectedWorkItems = mockApiResponse.map(item => ({
        ...item,
        createdAt: new Date(item.createdAt),
      }));

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: mockApiResponse }),
      });

      const { result } = renderHook(() => useWorkItems(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(expectedWorkItems);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/work-items',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should handle fetch error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: { message: 'Internal server error', code: 'SERVER_ERROR' },
        }),
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
      const now = Date.now();
      const mockApiResponse = {
        id: '1',
        title: 'Test Item',
        status: 'PENDING' as const,
        priority: 'high' as const,
        createdAt: now,
      };

      const expectedWorkItem = {
        ...mockApiResponse,
        createdAt: new Date(now),
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: mockApiResponse }),
      });

      const { result } = renderHook(() => useWorkItem('1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(expectedWorkItem);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/work-items/1',
        expect.objectContaining({
          method: 'GET',
        })
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
      const now = Date.now();
      const newItem = {
        title: 'New Item',
        description: 'Test description',
        priority: 'medium' as const,
      };

      const mockApiResponse = {
        id: '3',
        ...newItem,
        status: 'PENDING' as const,
        createdAt: now,
      };

      const expectedCreatedItem = {
        ...mockApiResponse,
        createdAt: new Date(now),
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: mockApiResponse }),
      });

      const { result } = renderHook(() => useCreateWorkItem(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(newItem);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(expectedCreatedItem);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/work-items',
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
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: { message: 'Validation error', code: 'VALIDATION_ERROR' },
        }),
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
      const now = Date.now();
      const updates = {
        title: 'Updated Title',
        status: 'COMPLETED' as const,
      };

      const mockApiResponse = {
        id: '1',
        ...updates,
        priority: 'high' as const,
        createdAt: now,
      };

      const expectedUpdatedItem = {
        ...mockApiResponse,
        createdAt: new Date(now),
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: mockApiResponse }),
      });

      const { result } = renderHook(() => useUpdateWorkItem(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: '1', data: updates });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(expectedUpdatedItem);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/work-items/1',
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
        status: 204,
        headers: new Headers({ 'content-type': 'text/plain' }),
      });

      const { result } = renderHook(() => useDeleteWorkItem(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('1');

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/work-items/1',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('should handle deletion error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: { message: 'Not found', code: 'NOT_FOUND' },
        }),
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
