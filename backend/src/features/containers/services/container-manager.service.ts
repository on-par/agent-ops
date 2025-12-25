import type { Readable } from "stream";
import { v4 as uuidv4 } from "uuid";
import type { DrizzleDatabase } from "../../../shared/db/index.js";
import type { Container, ContainerStatus } from "../../../shared/db/schema.js";
import { ContainerRepository } from "../repositories/container.repository.js";
import { WorkspaceRepository } from "../../workspaces/repositories/workspace.repository.js";
import type {
  DockerClientInterface,
  DockerLogsOptions,
} from "../interfaces/docker-client.interface.js";
import type { ContainerCreateOptions } from "../types/container.types.js";
import { DockerClientService } from "./docker-client.service.js";

/**
 * Service for managing Docker containers for agent execution
 * Handles container lifecycle: create, start, stop, remove
 * Integrates with Docker API and manages container database records
 */
export class ContainerManagerService {
  private repository: ContainerRepository;
  private workspaceRepository: WorkspaceRepository;
  private dockerClient: DockerClientInterface;

  /**
   * Create a new ContainerManagerService
   * @param db - Database instance
   * @param dockerClient - Docker client (defaults to DockerClientService)
   */
  constructor(db: DrizzleDatabase, dockerClient?: DockerClientInterface) {
    this.repository = new ContainerRepository(db);
    this.workspaceRepository = new WorkspaceRepository(db);
    this.dockerClient = dockerClient ?? new DockerClientService();
  }

  /**
   * Create a new Docker container
   * @param options - Container creation options
   * @returns The created container record
   */
  async createContainer(options: ContainerCreateOptions): Promise<Container> {
    // Get workspace path if workspaceId is provided
    let workspacePath: string | undefined;
    if (options.workspaceId) {
      const workspace = await this.workspaceRepository.findById(options.workspaceId);
      if (!workspace) {
        throw new Error(`Workspace with id ${options.workspaceId} not found`);
      }
      workspacePath = workspace.path;
    }

    // Build Docker create options
    const dockerOptions: {
      Image: string;
      name: string;
      HostConfig?: {
        Binds?: string[];
        NanoCpus?: number;
        Memory?: number;
      };
      Env?: string[];
      WorkingDir?: string;
    } = {
      Image: options.image,
      name: options.name,
      WorkingDir: "/workspace",
    };

    // Add host config for binds and resource limits
    dockerOptions.HostConfig = {};

    // Mount workspace directory if available
    if (workspacePath) {
      dockerOptions.HostConfig.Binds = [`${workspacePath}:/workspace`];
    }

    // Apply CPU limits (convert cores to nanocpus: 1 core = 1000000000 nanocpus)
    if (options.resourceLimits?.cpuLimit) {
      dockerOptions.HostConfig.NanoCpus = Math.floor(
        options.resourceLimits.cpuLimit * 1000000000
      );
    }

    // Apply memory limits (in bytes)
    if (options.resourceLimits?.memoryLimit) {
      dockerOptions.HostConfig.Memory = options.resourceLimits.memoryLimit;
    }

    // Add environment variables
    if (options.env) {
      dockerOptions.Env = Object.entries(options.env).map(([key, value]) => `${key}=${value}`);
    }

    try {
      // Create Docker container
      const dockerContainerId = await this.dockerClient.createContainer(dockerOptions);

      // Create database record
      const container = await this.repository.create({
        id: uuidv4(),
        containerId: dockerContainerId,
        name: options.name,
        image: options.image,
        status: "creating",
        workspaceId: options.workspaceId ?? null,
        executionId: options.executionId ?? null,
        createdAt: new Date(),
      });

      return container;
    } catch (error) {
      throw new Error(
        `Failed to create container: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Start a Docker container
   * @param id - Container ID (database ID)
   * @returns The updated container record
   */
  async startContainer(id: string): Promise<Container> {
    // Get container from database
    const container = await this.repository.findById(id);
    if (!container) {
      throw new Error(`Container with id ${id} not found`);
    }

    try {
      // Start the Docker container
      await this.dockerClient.startContainer(container.containerId);

      // Update database record
      const updatedContainer = await this.repository.update(id, {
        status: "running",
        startedAt: new Date(),
      });

      return updatedContainer;
    } catch (error) {
      // Update status to error if start fails
      await this.repository.updateStatus(id, "error");
      throw new Error(
        `Failed to start container ${id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Stop a Docker container
   * Sends SIGTERM first, then SIGKILL after timeout
   * @param id - Container ID (database ID)
   * @param timeout - Timeout in seconds before killing (default: 10)
   * @returns The updated container record
   */
  async stopContainer(id: string, timeout: number = 10): Promise<Container> {
    // Get container from database
    const container = await this.repository.findById(id);
    if (!container) {
      throw new Error(`Container with id ${id} not found`);
    }

    try {
      // Stop the Docker container (graceful shutdown with timeout)
      await this.dockerClient.stopContainer(container.containerId, timeout);

      // Update database record
      const updatedContainer = await this.repository.update(id, {
        status: "stopped",
        stoppedAt: new Date(),
      });

      return updatedContainer;
    } catch (error) {
      throw new Error(
        `Failed to stop container ${id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Remove a Docker container
   * @param id - Container ID (database ID)
   * @param force - Force removal even if running (default: false)
   */
  async removeContainer(id: string, force: boolean = false): Promise<void> {
    // Get container from database
    const container = await this.repository.findById(id);
    if (!container) {
      throw new Error(`Container with id ${id} not found`);
    }

    try {
      // Update status to removing
      await this.repository.updateStatus(id, "removing");

      // Remove the Docker container
      await this.dockerClient.removeContainer(container.containerId, force);

      // Delete from database
      await this.repository.delete(id);
    } catch (error) {
      // Update status to error if removal fails
      await this.repository.updateStatus(id, "error");
      throw new Error(
        `Failed to remove container ${id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get container status and information
   * @param id - Container ID (database ID)
   * @returns Container information or null if not found
   */
  async getContainerStatus(id: string): Promise<Container | null> {
    return this.repository.findById(id);
  }

  /**
   * Execute a command in a running container
   * @param id - Container ID (database ID)
   * @param command - Command and arguments to execute
   * @returns Execution result with stdout, stderr, and exit code
   */
  async exec(
    id: string,
    command: string[]
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    // Get container from database
    const container = await this.repository.findById(id);
    if (!container) {
      throw new Error(`Container with id ${id} not found`);
    }

    try {
      // Execute command in Docker container
      const result = await this.dockerClient.exec(container.containerId, {
        Cmd: command,
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
      });

      return result;
    } catch (error) {
      throw new Error(
        `Failed to exec in container ${id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get container logs as a stream
   * @param id - Container ID (database ID)
   * @param options - Log options (follow, tail, timestamps, etc.)
   * @returns Readable stream of log data
   */
  async getLogs(id: string, options?: DockerLogsOptions): Promise<Readable> {
    // Get container from database
    const container = await this.repository.findById(id);
    if (!container) {
      throw new Error(`Container with id ${id} not found`);
    }

    try {
      // Get logs from Docker container
      const logStream = await this.dockerClient.getLogs(container.containerId, options);
      return logStream;
    } catch (error) {
      throw new Error(
        `Failed to get logs for container ${id}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * List all containers
   * @returns Array of all containers
   */
  async listContainers(): Promise<Container[]> {
    return this.repository.findAll();
  }

  /**
   * Find containers by workspace ID
   * @param workspaceId - Workspace ID
   * @returns Array of containers for the workspace
   */
  async findByWorkspaceId(workspaceId: string): Promise<Container[]> {
    return this.repository.findByWorkspaceId(workspaceId);
  }

  /**
   * Find containers by execution ID
   * @param executionId - Execution ID
   * @returns Array of containers for the execution
   */
  async findByExecutionId(executionId: string): Promise<Container[]> {
    return this.repository.findByExecutionId(executionId);
  }

  /**
   * Find containers by status
   * @param status - Container status
   * @returns Array of containers with the specified status
   */
  async findByStatus(status: ContainerStatus): Promise<Container[]> {
    return this.repository.findByStatus(status);
  }
}
