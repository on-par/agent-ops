/**
 * Tests for GitHub connections hooks
 */

import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '../test-utils';
import {
  useGitHubConnections,
  useDeleteGitHubConnection,
  githubConnectionsKeys,
} from './use-github-connections';

describe('GitHub Connections Keys', () => {
  it('should generate correct hierarchical keys', () => {
    expect(githubConnectionsKeys.all).toEqual(['githubConnections']);
    expect(githubConnectionsKeys.lists()).toEqual(['githubConnections', 'list']);
    expect(githubConnectionsKeys.details()).toEqual(['githubConnections', 'detail']);
    expect(githubConnectionsKeys.detail('conn-1')).toEqual(['githubConnections', 'detail', 'conn-1']);
  });
});

describe('useGitHubConnections - Query Hook', () => {
  it('should return loading state initially', () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useGitHubConnections(), { wrapper });

    // Assert
    expect(result.current.isLoading).toBe(true);
  });

  it('should return success with connections list', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useGitHubConnections(), { wrapper });

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

  it('should return data with correct structure', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useGitHubConnections(), { wrapper });

    // Assert
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const connections = result.current.data;
    expect(connections).toHaveLength(1);

    const connection = connections![0];
    expect(connection).toHaveProperty('id');
    expect(connection).toHaveProperty('username');
    expect(connection).toHaveProperty('avatarUrl');
    expect(connection).toHaveProperty('scopes');
    expect(connection).toHaveProperty('createdAt');
  });
});

describe('useDeleteGitHubConnection - Mutation Hook', () => {
  it('should have isPending false initially', () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useDeleteGitHubConnection(), { wrapper });

    // Assert
    expect(result.current.isPending).toBe(false);
  });

  it('should successfully delete a connection', async () => {
    // Arrange
    const wrapper = createWrapper();
    const connectionId = 'conn-1';

    // Act
    const { result } = renderHook(() => useDeleteGitHubConnection(), { wrapper });

    // Assert - verify mutation is available
    expect(result.current.mutate).toBeDefined();

    // Act - trigger mutation
    result.current.mutate(connectionId);

    // Assert - wait for success
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});
