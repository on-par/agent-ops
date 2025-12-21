import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useWorkers,
  useWorker,
  useCreateWorker,
  useUpdateWorker,
  useDeleteWorker,
  usePauseWorker,
  useResumeWorker,
} from '../../hooks/useWorkers';

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

describe('useWorkers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('useWorkers', () => {
    it('should fetch all workers', async () => {
      const mockWorkers = [
        {
          id: 'worker-1',
          name: 'Test Worker 1',
          status: 'active' as const,
          currentTask: 'Processing data',
          tasksCompleted: 100,
          successRate: 98.5,
        },
        {
          id: 'worker-2',
          name: 'Test Worker 2',
          status: 'idle' as const,
          tasksCompleted: 50,
          successRate: 95.0,
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockWorkers,
      });

      const { result } = renderHook(() => useWorkers(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockWorkers);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/workers'
      );
    });

    it('should handle fetch error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useWorkers(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });
  });

  describe('useWorker', () => {
    it('should fetch a single worker', async () => {
      const mockWorker = {
        id: 'worker-1',
        name: 'Test Worker',
        status: 'active' as const,
        currentTask: 'Processing data',
        tasksCompleted: 100,
        successRate: 98.5,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockWorker,
      });

      const { result } = renderHook(() => useWorker('worker-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockWorker);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/workers/worker-1'
      );
    });

    it('should not fetch if id is empty', () => {
      const { result } = renderHook(() => useWorker(''), {
        wrapper: createWrapper(),
      });

      expect(result.current.isFetching).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('useCreateWorker', () => {
    it('should create a worker', async () => {
      const newWorker = {
        name: 'New Worker',
        status: 'idle' as const,
      };

      const createdWorker = {
        id: 'worker-3',
        ...newWorker,
        tasksCompleted: 0,
        successRate: 0,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => createdWorker,
      });

      const { result } = renderHook(() => useCreateWorker(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(newWorker);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(createdWorker);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/workers',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newWorker),
        })
      );
    });

    it('should handle creation error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      const { result } = renderHook(() => useCreateWorker(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        name: 'New Worker',
        status: 'active' as const,
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });
  });

  describe('useUpdateWorker', () => {
    it('should update a worker', async () => {
      const updates = {
        name: 'Updated Worker',
        status: 'active' as const,
      };

      const updatedWorker = {
        id: 'worker-1',
        ...updates,
        tasksCompleted: 150,
        successRate: 99.0,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => updatedWorker,
      });

      const { result } = renderHook(() => useUpdateWorker(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: 'worker-1', data: updates });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(updatedWorker);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/workers/worker-1',
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })
      );
    });
  });

  describe('useDeleteWorker', () => {
    it('should delete a worker', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
      });

      const { result } = renderHook(() => useDeleteWorker(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('worker-1');

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/workers/worker-1',
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

      const { result } = renderHook(() => useDeleteWorker(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('non-existent-id');

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });
  });

  describe('usePauseWorker', () => {
    it('should pause a worker', async () => {
      const pausedWorker = {
        id: 'worker-1',
        name: 'Test Worker',
        status: 'paused' as const,
        tasksCompleted: 100,
        successRate: 98.5,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => pausedWorker,
      });

      const { result } = renderHook(() => usePauseWorker(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('worker-1');

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(pausedWorker);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/workers/worker-1/pause',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('useResumeWorker', () => {
    it('should resume a worker', async () => {
      const resumedWorker = {
        id: 'worker-1',
        name: 'Test Worker',
        status: 'active' as const,
        tasksCompleted: 100,
        successRate: 98.5,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => resumedWorker,
      });

      const { result } = renderHook(() => useResumeWorker(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('worker-1');

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(resumedWorker);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/workers/worker-1/resume',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });
});
