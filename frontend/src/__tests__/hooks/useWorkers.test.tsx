import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useWorkers,
  useWorker,
  useSpawnWorker,
  useControlWorker,
  useTerminateWorker,
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
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: mockWorkers }),
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
        '/api/workers',
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
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: mockWorker }),
      });

      const { result } = renderHook(() => useWorker('worker-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockWorker);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/workers/worker-1',
        expect.objectContaining({
          method: 'GET',
        })
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

  describe('useSpawnWorker', () => {
    it('should spawn a worker', async () => {
      const newWorker = {
        name: 'New Worker',
      };

      const spawnedWorker = {
        id: 'worker-3',
        name: newWorker.name,
        status: 'idle' as const,
        tasksCompleted: 0,
        successRate: 0,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: spawnedWorker }),
      });

      const { result } = renderHook(() => useSpawnWorker(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(newWorker);

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(spawnedWorker);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/workers',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newWorker),
        })
      );
    });

    it('should handle spawn error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: { message: 'Validation error', code: 'VALIDATION_ERROR' },
        }),
      });

      const { result } = renderHook(() => useSpawnWorker(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        name: 'New Worker',
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toBeDefined();
    });
  });

  describe('useControlWorker', () => {
    it('should control a worker', async () => {
      const action = { action: 'pause' as const };

      const controlledWorker = {
        id: 'worker-1',
        name: 'Test Worker',
        status: 'paused' as const,
        tasksCompleted: 150,
        successRate: 99.0,
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: controlledWorker }),
      });

      const { result } = renderHook(() => useControlWorker(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ id: 'worker-1', action });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(controlledWorker);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/workers/worker-1/control',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action),
        })
      );
    });
  });

  describe('useTerminateWorker', () => {
    it('should terminate a worker', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers({ 'content-type': 'text/plain' }),
      });

      const { result } = renderHook(() => useTerminateWorker(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('worker-1');

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/workers/worker-1',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('should handle termination error', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          error: { message: 'Not found', code: 'NOT_FOUND' },
        }),
      });

      const { result } = renderHook(() => useTerminateWorker(), {
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
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: pausedWorker }),
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
        '/api/workers/worker-1/control',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'pause' }),
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
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true, data: resumedWorker }),
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
        '/api/workers/worker-1/control',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'resume' }),
        })
      );
    });
  });
});
