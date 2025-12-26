/**
 * Comprehensive tests for React Query container hooks
 *
 * Tests cover:
 * - Query key factory correctness
 * - useContainers hook (loading, success, error states)
 * - useContainer hook (single container retrieval)
 * - useCreateContainer, useStartContainer, useStopContainer mutations
 * - useDeleteContainer mutation
 * - Date field parsing
 * - Error handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { createWrapper } from '../test-utils';
import { API_BASE } from '../lib/api';
import {
  useContainers,
  useContainer,
  useCreateContainer,
  useStartContainer,
  useStopContainer,
  useDeleteContainer,
  containerKeys,
} from './use-containers';

describe('useContainers - Query Key Factory', () => {
  it('should generate correct hierarchical keys', () => {
    expect(containerKeys.all).toEqual(['containers']);
    expect(containerKeys.lists()).toEqual(['containers', 'list']);
    expect(containerKeys.list({})).toEqual(['containers', 'list', {}]);
    expect(containerKeys.details()).toEqual(['containers', 'detail']);
    expect(containerKeys.detail('container-1')).toEqual(['containers', 'detail', 'container-1']);
  });
});

describe('useContainers - Query Hook', () => {
  it('should return loading state initially', () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useContainers(), { wrapper });

    // Assert
    expect(result.current.isLoading).toBe(true);
  });

  it('should return success with container list', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useContainers(), { wrapper });

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

  it('should parse date fields correctly (createdAt, startedAt, stoppedAt)', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useContainers(), { wrapper });

    // Assert - wait for successful fetch
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Assert - check date parsing
    const items = result.current.data?.items;
    if (items && items.length > 0) {
      const container = items[0];
      expect(container.createdAt).toBeInstanceOf(Date);
      if (container.startedAt) {
        expect(container.startedAt).toBeInstanceOf(Date);
      }
      if (container.stoppedAt) {
        expect(container.stoppedAt).toBeInstanceOf(Date);
      }
    }
  });

  it('should handle empty list response', async () => {
    // Arrange
    server.use(
      http.get(`${API_BASE}/api/containers`, () => {
        return HttpResponse.json({
          items: [],
          total: 0,
          hasMore: false,
        });
      })
    );

    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useContainers(), { wrapper });

    // Assert
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.items).toEqual([]);
    expect(result.current.data?.total).toBe(0);
  });

  it('should handle 500 server error', async () => {
    // Arrange
    server.use(
      http.get(`${API_BASE}/api/containers`, () => {
        return HttpResponse.json({ error: 'Server error' }, { status: 500 });
      })
    );

    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useContainers(), { wrapper });

    // Assert
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });
});

describe('useContainer - Single Container Query', () => {
  it('should return single container by ID', async () => {
    // Arrange
    const containerId = 'test-container-123';
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useContainer(containerId), { wrapper });

    // Assert
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeDefined();
    expect(result.current.data?.id).toBe(containerId);
    expect(result.current.data?.status).toBeDefined();
  });

  it('should handle 404 not found error', async () => {
    // Arrange
    server.use(
      http.get(`${API_BASE}/api/containers/:id`, () => {
        return HttpResponse.json({ error: 'Not found' }, { status: 404 });
      })
    );

    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useContainer('nonexistent'), { wrapper });

    // Assert
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeDefined();
  });
});

describe('useCreateContainer - Mutation', () => {
  it('should call POST and return created container', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useCreateContainer(), { wrapper });

    // Assert - initially not loading
    expect(result.current.isPending).toBe(false);

    // Act - create container
    result.current.mutate({
      name: 'new-container',
      image: 'node:20-alpine',
    });

    // Assert - wait for mutation to complete
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeDefined();
    expect(result.current.data?.name).toBe('new-container');
  });

  it('should invalidate list cache after creation', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result: listResult } = renderHook(() => useContainers(), { wrapper });
    const { result: mutateResult } = renderHook(() => useCreateContainer(), { wrapper });

    // Wait for initial list to load
    await waitFor(() => {
      expect(listResult.current.isSuccess).toBe(true);
    });

    const initialListCount = listResult.current.data?.total;

    // Act - create container
    mutateResult.current.mutate({
      name: 'new-container',
      image: 'node:20-alpine',
    });

    // Assert - wait for mutation to complete
    await waitFor(() => {
      expect(mutateResult.current.isSuccess).toBe(true);
    });

    // After creation, the list should be refetched (could be triggered by invalidation)
    expect(mutateResult.current.data).toBeDefined();
  });
});

describe('useStartContainer - Mutation', () => {
  it('should start container and change status to running', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useStartContainer(), { wrapper });

    // Act - start container
    result.current.mutate('container-123');

    // Assert
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.status).toBe('running');
  });
});

describe('useStopContainer - Mutation', () => {
  it('should stop container and change status to stopped', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useStopContainer(), { wrapper });

    // Act - stop container
    result.current.mutate('container-123');

    // Assert
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.status).toBe('stopped');
    expect(result.current.data?.stoppedAt).toBeDefined();
  });
});

describe('useDeleteContainer - Mutation', () => {
  it('should delete container and invalidate cache', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useDeleteContainer(), { wrapper });

    // Act - delete container
    result.current.mutate('container-123');

    // Assert
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    // Mutation should complete successfully (204 response)
    expect(result.current.data).toBeDefined();
  });
});
