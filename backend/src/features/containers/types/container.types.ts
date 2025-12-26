import type { ContainerStatus } from "../../../shared/db/schema.js";

/**
 * Resource limits for container execution
 */
export interface ContainerResourceLimits {
  /** CPU limit in cores (e.g., 1.0 = 1 core, 0.5 = half a core) */
  cpuLimit?: number;
  /** Memory limit in bytes */
  memoryLimit?: number;
}

/**
 * Options for creating a new container
 */
export interface ContainerCreateOptions {
  /** Docker image to use (e.g., "node:20-alpine") */
  image: string;
  /** Container name */
  name: string;
  /** Associated workspace ID */
  workspaceId?: string;
  /** Associated execution ID */
  executionId?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Resource limits */
  resourceLimits?: ContainerResourceLimits;
}

/**
 * Options for retrieving container logs
 */
export interface ContainerLogOptions {
  /** Follow log output (stream mode) */
  follow?: boolean;
  /** Number of lines to show from the end of the logs */
  tail?: number;
  /** Show timestamps in log output */
  timestamps?: boolean;
}

/**
 * Information about a running or stopped container
 */
export interface ContainerInfo {
  /** Internal database ID */
  id: string;
  /** Docker container ID */
  containerId: string;
  /** Container name */
  name: string;
  /** Current container status */
  status: ContainerStatus;
  /** Docker image used */
  image: string;
  /** Port mappings (format: "hostPort:containerPort") */
  ports?: string[];
  /** Timestamp when container was created */
  createdAt: Date;
  /** Timestamp when container was started */
  startedAt?: Date;
  /** Timestamp when container was stopped */
  stoppedAt?: Date;
  /** Associated workspace ID */
  workspaceId?: string;
  /** Associated worker ID */
  workerId?: string;
  /** Associated execution ID */
  executionId?: string;
}
