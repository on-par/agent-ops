/**
 * Comprehensive tests for React Query execution hooks
 *
 * Tests cover:
 * - Query key factory correctness
 * - useExecutions hook (loading, success, error states)
 * - useExecution hook (single execution with traces)
 * - useExecutionTraces hook
 * - Date field parsing (startedAt, completedAt, createdAt)
 * - Error handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createWrapper } from '../test-utils';
import { API_BASE } from '../lib/api';
import {
  useExecutions,
  useExecution,
  useExecutionTraces,
  executionKeys,
} from './use-executions';

describe('useExecutions - Query Key Factory', () => {
  it('should generate correct hierarchical keys', () => {
    expect(executionKeys.all).toEqual(['executions']);
    expect(executionKeys.lists()).toEqual(['executions', 'list']);
    expect(executionKeys.list({})).toEqual(['executions', 'list', {}]);
    expect(executionKeys.details()).toEqual(['executions', 'detail']);
    expect(executionKeys.detail('exec-1')).toEqual(['executions', 'detail', 'exec-1']);
    expect(executionKeys.traces('exec-1')).toEqual(['executions', 'detail', 'exec-1', 'traces']);
  });
});

describe('useExecutions - Query Hook', () => {
  it('should return loading state initially', () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useExecutions(), { wrapper });

    // Assert
    expect(result.current.isLoading).toBe(true);
  });

  it('should return success with execution list', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useExecutions(), { wrapper });

    // Assert - initially loading
    expect(result.current.isLoading).toBe(true);

    // Assert - after fetch succeeds
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeDefined();
    expect(result.current.data?.items).toBeInstanceOf(Array);
    expect(result.current.isLoading).toBe(false);
  });

  it('should parse date fields correctly (startedAt, completedAt, createdAt)', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useExecutions(), { wrapper });

    // Assert - wait for successful fetch
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Assert - check date parsing
    const items = result.current.data?.items;
    if (items && items.length > 0) {
      const execution = items[0];
      expect(execution.createdAt).toBeInstanceOf(Date);
      if (execution.startedAt) {
        expect(execution.startedAt).toBeInstanceOf(Date);
      }
      if (execution.completedAt) {
        expect(execution.completedAt).toBeInstanceOf(Date);
      }
    }
  });

  it('should handle empty list response', async () => {
    // Arrange
    server.use(
      http.get(`${API_BASE}/api/executions`, () => {
        return HttpResponse.json({
          items: [],
          total: 0,
          hasMore: false,
        });
      })
    );

    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useExecutions(), { wrapper });

    // Assert
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.items).toEqual([]);
    expect(result.current.data?.total).toBe(0);
  });

  it('should handle execution not found error', async () => {
    // Arrange
    server.use(
      http.get(`${API_BASE}/api/executions`, () => {
        return HttpResponse.json({ error: 'Not found' }, { status: 404 });
      })
    );

    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useExecutions(), { wrapper });

    // Assert
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });
});

describe('useExecution - Single Execution Query with Traces', () => {
  it('should return single execution with traces by ID', async () => {
    // Arrange
    const executionId = 'test-exec-123';
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useExecution(executionId), { wrapper });

    // Assert
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeDefined();
    expect(result.current.data?.id).toBe(executionId);
    expect(result.current.data?.status).toBeDefined();
    expect(result.current.data?.traces).toBeDefined();
  });

  it('should parse trace dates correctly', async () => {
    // Arrange
    const executionId = 'test-exec-123';
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useExecution(executionId), { wrapper });

    // Assert
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const traces = result.current.data?.traces;
    if (traces && traces.length > 0) {
      traces.forEach((trace) => {
        expect(trace.timestamp).toBeInstanceOf(Date);
      });
    }
  });

  it('should handle execution not found error', async () => {
    // Arrange
    server.use(
      http.get(`${API_BASE}/api/executions/:id`, () => {
        return HttpResponse.json({ error: 'Not found' }, { status: 404 });
      })
    );

    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useExecution('nonexistent'), { wrapper });

    // Assert
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });
});

describe('useExecutionTraces - Traces Query', () => {
  it('should return traces for execution', async () => {
    // Arrange
    const executionId = 'test-exec-123';
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useExecutionTraces(executionId), { wrapper });

    // Assert
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeDefined();
    expect(result.current.data).toBeInstanceOf(Array);
  });

  it('should handle empty traces', async () => {
    // Arrange
    server.use(
      http.get(`${API_BASE}/api/executions/:id/traces`, () => {
        return HttpResponse.json([]);
      })
    );

    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useExecutionTraces('exec-123'), { wrapper });

    // Assert
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([]);
  });

  it('should parse trace data correctly', async () => {
    // Arrange
    const executionId = 'test-exec-123';
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useExecutionTraces(executionId), { wrapper });

    // Assert
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const traces = result.current.data;
    if (traces && traces.length > 0) {
      traces.forEach((trace) => {
        expect(trace.id).toBeDefined();
        expect(trace.eventType).toBeDefined();
        expect(trace.timestamp).toBeInstanceOf(Date);
        expect(trace.data).toBeDefined();
      });
    }
  });

  it('should handle trace parsing errors gracefully', async () => {
    // Arrange
    server.use(
      http.get(`${API_BASE}/api/executions/:id/traces`, () => {
        return HttpResponse.json({
          items: [{ invalid: 'trace' }],
        });
      })
    );

    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useExecutionTraces('exec-123'), { wrapper });

    // Assert - should complete without throwing
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});
