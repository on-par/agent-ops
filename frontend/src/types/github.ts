/**
 * GitHub Connection as returned from API
 */
export interface GitHubConnection {
  id: string;
  username: string;
  avatarUrl: string | null;
  scopes: string;
  createdAt: string;
}

/**
 * Connected Repository as returned from API
 */
export interface Repository {
  id: string;
  connectionId: string;
  githubId: number;
  fullName: string;
  owner: string;
  name: string;
  description: string | null;
  private: boolean;
  syncStatus: SyncStatus;
  labelsFilter: string[] | null;
  autoAssign: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Available Repository from GitHub API (not yet connected)
 */
export interface AvailableRepository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  owner: {
    login: string;
    avatar_url: string;
  };
  permissions: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
}

/**
 * Input for connecting a new repository
 */
export interface RepositoryConnectInput {
  connectionId: string;
  githubId: number;
  fullName: string;
  owner: string;
  name: string;
  description: string | null;
  private: boolean;
  labelsFilter?: string[];
  autoAssign?: boolean;
}

/**
 * Input for updating repository sync configuration
 */
export interface RepositoryUpdateInput {
  labelsFilter?: string[];
  autoAssign?: boolean;
}

/**
 * Sync status for repository
 */
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'error';
