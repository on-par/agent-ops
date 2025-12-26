/**
 * Type compilation test for github types
 */

import { describe, it } from 'vitest';
import type {
  GitHubConnection,
  Repository,
  AvailableRepository,
  RepositoryConnectInput,
  RepositoryUpdateInput,
  SyncStatus,
} from './github';

describe('GitHub Types', () => {
  it('should compile without TypeScript errors', () => {
    // This test just verifies that the types compile correctly
    // The actual type checking happens at compile time

    const connection: GitHubConnection = {
      id: 'test-id',
      username: 'testuser',
      avatarUrl: null,
      scopes: 'repo',
      createdAt: '2025-01-01T00:00:00Z',
    };

    const repository: Repository = {
      id: 'repo-id',
      connectionId: 'conn-id',
      githubId: 123,
      fullName: 'test/repo',
      owner: 'test',
      name: 'repo',
      description: null,
      private: false,
      syncStatus: 'synced' as SyncStatus,
      labelsFilter: null,
      autoAssign: false,
      lastSyncAt: null,
      lastSyncError: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    };

    const availableRepository: AvailableRepository = {
      id: 123,
      name: 'repo',
      full_name: 'test/repo',
      description: null,
      private: false,
      owner: {
        login: 'test',
        avatar_url: 'https://example.com/avatar.jpg',
      },
      permissions: {
        admin: true,
        push: true,
        pull: true,
      },
    };

    const connectInput: RepositoryConnectInput = {
      connectionId: 'conn-id',
      githubId: 123,
      fullName: 'test/repo',
      owner: 'test',
      name: 'repo',
      description: null,
      private: false,
      labelsFilter: ['bug'],
      autoAssign: true,
    };

    const updateInput: RepositoryUpdateInput = {
      labelsFilter: ['feature'],
      autoAssign: false,
    };

    expect(connection).toBeDefined();
    expect(repository).toBeDefined();
    expect(availableRepository).toBeDefined();
    expect(connectInput).toBeDefined();
    expect(updateInput).toBeDefined();
  });
});
