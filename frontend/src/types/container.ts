/**
 * Container types matching backend Container types
 * These types are used for displaying and managing development containers
 */

/**
 * Container status values
 */
export type ContainerStatus = 'created' | 'running' | 'stopped' | 'exited' | 'error';

/**
 * Container resource usage
 */
export interface ContainerResources {
  cpuPercent?: number;
  memoryUsage?: number;
  memoryLimit?: number;
  networkRx?: number;
  networkTx?: number;
}

/**
 * Container configuration
 */
export interface ContainerConfig {
  image: string;
  command?: string[];
  env?: Record<string, string>;
  workingDir?: string;
  volumes?: Record<string, string>;
  ports?: Record<string, number>;
}

/**
 * Container entity
 */
export interface Container {
  id: string;
  name: string;
  status: ContainerStatus;
  image: string;
  config: ContainerConfig;
  workspaceId: string | null;
  executionId: string | null;
  resources: ContainerResources | null;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  stoppedAt: Date | null;
  updatedAt: Date;
}

/**
 * Container list item - minimal data for list display
 */
export interface ContainerListItem {
  id: string;
  name: string;
  status: ContainerStatus;
  image: string;
  workspaceId: string | null;
  executionId: string | null;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  stoppedAt: Date | null;
}

/**
 * Input for creating a new container
 */
export interface ContainerCreateInput {
  name: string;
  image: string;
  command?: string[];
  env?: Record<string, string>;
  workingDir?: string;
  volumes?: Record<string, string>;
  ports?: Record<string, number>;
  workspaceId?: string;
  executionId?: string;
}

/**
 * Filters for container list queries
 */
export interface ContainerFilters {
  status?: ContainerStatus;
  workspaceId?: string;
  executionId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Paginated container list response
 */
export interface ContainerListResponse {
  items: ContainerListItem[];
  total: number;
  hasMore: boolean;
}
