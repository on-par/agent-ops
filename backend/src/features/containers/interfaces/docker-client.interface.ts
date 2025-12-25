import type { Readable } from "stream";

/**
 * Options for creating a Docker container
 */
export interface DockerCreateContainerOptions {
  /** Docker image to use */
  Image: string;
  /** Container name */
  name: string;
  /** Host configuration (mounts, resource limits, etc.) */
  HostConfig?: {
    /** Bind mounts */
    Binds?: string[];
    /** CPU quota in nanocpus (1 CPU = 1000000000) */
    NanoCpus?: number;
    /** Memory limit in bytes */
    Memory?: number;
  };
  /** Environment variables in KEY=VALUE format */
  Env?: string[];
  /** Working directory */
  WorkingDir?: string;
  /** Command to run */
  Cmd?: string[];
}

/**
 * Options for executing a command in a container
 */
export interface DockerExecOptions {
  /** Command to execute */
  Cmd: string[];
  /** Attach to stdout */
  AttachStdout?: boolean;
  /** Attach to stderr */
  AttachStderr?: boolean;
  /** Attach to stdin */
  AttachStdin?: boolean;
  /** Allocate TTY */
  Tty?: boolean;
  /** Environment variables in KEY=VALUE format */
  Env?: string[];
  /** Working directory */
  WorkingDir?: string;
}

/**
 * Options for getting container logs
 */
export interface DockerLogsOptions {
  /** Follow log output */
  follow?: boolean;
  /** Show stdout */
  stdout?: boolean;
  /** Show stderr */
  stderr?: boolean;
  /** Number of lines from the end */
  tail?: number;
  /** Show timestamps */
  timestamps?: boolean;
}

/**
 * Container information from Docker
 */
export interface DockerContainerInfo {
  /** Container ID */
  Id: string;
  /** Container state */
  State: {
    Status: string;
    Running: boolean;
    Paused: boolean;
    Restarting: boolean;
    OOMKilled: boolean;
    Dead: boolean;
    Pid: number;
    ExitCode: number;
    Error: string;
    StartedAt: string;
    FinishedAt: string;
  };
  /** Container name */
  Name: string;
  /** Container config */
  Config: {
    Image: string;
    Env: string[];
  };
}

/**
 * Execution result from running a command in a container
 */
export interface DockerExecResult {
  /** Exit code of the command */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
}

/**
 * Interface for Docker client operations
 * Allows mocking Docker operations in tests
 */
export interface DockerClientInterface {
  /**
   * Create a new Docker container
   * @param options - Container creation options
   * @returns The container ID
   */
  createContainer(options: DockerCreateContainerOptions): Promise<string>;

  /**
   * Start a Docker container
   * @param containerId - Docker container ID
   */
  startContainer(containerId: string): Promise<void>;

  /**
   * Stop a Docker container
   * @param containerId - Docker container ID
   * @param timeout - Timeout in seconds before killing (default: 10)
   */
  stopContainer(containerId: string, timeout?: number): Promise<void>;

  /**
   * Remove a Docker container
   * @param containerId - Docker container ID
   * @param force - Force removal (default: false)
   */
  removeContainer(containerId: string, force?: boolean): Promise<void>;

  /**
   * Get container information
   * @param containerId - Docker container ID
   * @returns Container information
   */
  getContainer(containerId: string): Promise<DockerContainerInfo>;

  /**
   * List all containers
   * @param all - Include stopped containers (default: false)
   * @returns Array of container information
   */
  listContainers(all?: boolean): Promise<DockerContainerInfo[]>;

  /**
   * Execute a command in a running container
   * @param containerId - Docker container ID
   * @param options - Execution options
   * @returns Execution result with stdout, stderr, and exit code
   */
  exec(containerId: string, options: DockerExecOptions): Promise<DockerExecResult>;

  /**
   * Get container logs as a stream
   * @param containerId - Docker container ID
   * @param options - Log options
   * @returns Readable stream of log data
   */
  getLogs(containerId: string, options?: DockerLogsOptions): Promise<Readable>;
}
