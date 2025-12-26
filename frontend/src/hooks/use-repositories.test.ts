/**
 * Tests for GitHub repositories hooks
 */

import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '../test-utils';
import {
  useRepositories,
  useAvailableRepositories,
  useConnectRepository,
  useUpdateRepository,
  useDisconnectRepository,
  useSyncRepository,
  repositoriesKeys,
} from './use-repositories';

describe('Repositories Keys', () => {
  it('should generate correct hierarchical keys', () => {
    expect(repositoriesKeys.all).toEqual(['repositories']);
    expect(repositoriesKeys.lists()).toEqual(['repositories', 'list']);
    expect(repositoriesKeys.available('conn-1')).toEqual(['repositories', 'available', 'conn-1']);
    expect(repositoriesKeys.details()).toEqual(['repositories', 'detail']);
    expect(repositoriesKeys.detail('repo-1')).toEqual(['repositories', 'detail', 'repo-1']);
  });
});

describe('useRepositories - Query Hook', () => {
  it('should return loading state initially', () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useRepositories(), { wrapper });

    // Assert
    expect(result.current.isLoading).toBe(true);
  });

  it('should return success with repositories list', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useRepositories(), { wrapper });

    // Assert - initially loading
    expect(result.current.isLoading).toBe(true);

    // Assert - after fetch succeeds
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeDefined();
    expect(Array.isArray(result.current.data)).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it('should return data with correct repository structure', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useRepositories(), { wrapper });

    // Assert
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const repositories = result.current.data;
    expect(repositories).toHaveLength(1);

    const repo = repositories![0];
    expect(repo).toHaveProperty('id');
    expect(repo).toHaveProperty('connectionId');
    expect(repo).toHaveProperty('fullName');
    expect(repo).toHaveProperty('syncStatus');
    expect(repo).toHaveProperty('private');
  });
});

describe('useAvailableRepositories - Query Hook', () => {
  it('should not query when connectionId is empty', () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useAvailableRepositories(''), { wrapper });

    // Assert - should not be fetching
    expect(result.current.status).toBe('pending');
  });

  it('should return loading state with valid connectionId', () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useAvailableRepositories('conn-1'), { wrapper });

    // Assert
    expect(result.current.isLoading).toBe(true);
  });

  it('should return success with available repositories', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useAvailableRepositories('conn-1'), { wrapper });

    // Assert - after fetch succeeds
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeDefined();
    expect(Array.isArray(result.current.data)).toBe(true);
  });
});

describe('useConnectRepository - Mutation Hook', () => {
  it('should have isPending false initially', () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useConnectRepository(), { wrapper });

    // Assert
    expect(result.current.isPending).toBe(false);
  });

  it('should successfully connect a repository', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useConnectRepository(), { wrapper });

    // Assert - verify mutation is available
    expect(result.current.mutate).toBeDefined();

    // Act - trigger mutation
    result.current.mutate({
      connectionId: 'conn-1',
      githubId: 123,
      fullName: 'test/repo',
      owner: 'test',
      name: 'repo',
      description: null,
      private: false,
    });

    // Assert - wait for success
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});

describe('useUpdateRepository - Mutation Hook', () => {
  it('should have isPending false initially', () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useUpdateRepository(), { wrapper });

    // Assert
    expect(result.current.isPending).toBe(false);
  });

  it('should successfully update repository settings', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useUpdateRepository(), { wrapper });

    // Act - trigger mutation
    result.current.mutate({
      id: 'repo-1',
      data: {
        labelsFilter: ['bug', 'feature'],
        autoAssign: true,
      },
    });

    // Assert - wait for success
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});

describe('useDisconnectRepository - Mutation Hook', () => {
  it('should have isPending false initially', () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useDisconnectRepository(), { wrapper });

    // Assert
    expect(result.current.isPending).toBe(false);
  });

  it('should successfully disconnect a repository', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useDisconnectRepository(), { wrapper });

    // Act - trigger mutation
    result.current.mutate('repo-1');

    // Assert - wait for success
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});

describe('useSyncRepository - Mutation Hook', () => {
  it('should have isPending false initially', () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useSyncRepository(), { wrapper });

    // Assert
    expect(result.current.isPending).toBe(false);
  });

  it('should successfully trigger repository sync', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useSyncRepository(), { wrapper });

    // Act - trigger mutation
    result.current.mutate('repo-1');

    // Assert - wait for success
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});
