import Docker from "dockerode";
import type { Readable, Writable } from "stream";
import type {
  DockerClientInterface,
  DockerCreateContainerOptions,
  DockerExecOptions,
  DockerLogsOptions,
  DockerContainerInfo,
  DockerExecResult,
} from "../interfaces/docker-client.interface.js";

/**
 * Default implementation of DockerClientInterface using Dockerode
 * Wraps Dockerode with proper error handling and type safety
 */
export class DockerClientService implements DockerClientInterface {
  private docker: Docker;

  /**
   * Create a new Docker client
   * @param socketPath - Path to Docker socket (defaults to /var/run/docker.sock on Mac)
   */
  constructor(socketPath?: string) {
    this.docker = new Docker({
      socketPath: socketPath ?? "/var/run/docker.sock",
    });
  }

  /**
   * Create a new Docker container
   * @param options - Container creation options
   * @returns The container ID
   */
  async createContainer(options: DockerCreateContainerOptions): Promise<string> {
    try {
      const container = await this.docker.createContainer(options);
      return container.id;
    } catch (error) {
      throw new Error(
        `Failed to create container: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Start a Docker container
   * @param containerId - Docker container ID
   */
  async startContainer(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.start();
    } catch (error) {
      throw new Error(
        `Failed to start container ${containerId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Stop a Docker container
   * Sends SIGTERM first, then SIGKILL after timeout
   * @param containerId - Docker container ID
   * @param timeout - Timeout in seconds before killing (default: 10)
   */
  async stopContainer(containerId: string, timeout: number = 10): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.stop({ t: timeout });
    } catch (error) {
      // Ignore error if container is already stopped
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes("304") && !errorMessage.includes("not running")) {
        throw new Error(`Failed to stop container ${containerId}: ${errorMessage}`);
      }
    }
  }

  /**
   * Remove a Docker container
   * @param containerId - Docker container ID
   * @param force - Force removal (default: false)
   */
  async removeContainer(containerId: string, force: boolean = false): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.remove({ force });
    } catch (error) {
      throw new Error(
        `Failed to remove container ${containerId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get container information
   * @param containerId - Docker container ID
   * @returns Container information
   */
  async getContainer(containerId: string): Promise<DockerContainerInfo> {
    try {
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();
      return info as DockerContainerInfo;
    } catch (error) {
      throw new Error(
        `Failed to get container ${containerId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * List all containers
   * @param all - Include stopped containers (default: false)
   * @returns Array of container information
   */
  async listContainers(all: boolean = false): Promise<DockerContainerInfo[]> {
    try {
      const containers = await this.docker.listContainers({ all });
      // Map to full container info
      const containerInfos = await Promise.all(
        containers.map(async (c) => {
          const container = this.docker.getContainer(c.Id);
          const info = await container.inspect();
          return info as DockerContainerInfo;
        })
      );
      return containerInfos;
    } catch (error) {
      throw new Error(
        `Failed to list containers: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Execute a command in a running container
   * @param containerId - Docker container ID
   * @param options - Execution options
   * @returns Execution result with stdout, stderr, and exit code
   */
  async exec(containerId: string, options: DockerExecOptions): Promise<DockerExecResult> {
    try {
      const container = this.docker.getContainer(containerId);

      // Create exec instance
      const exec = await container.exec({
        Cmd: options.Cmd,
        AttachStdout: options.AttachStdout ?? true,
        AttachStderr: options.AttachStderr ?? true,
        AttachStdin: options.AttachStdin ?? false,
        Tty: options.Tty ?? false,
        Env: options.Env,
        WorkingDir: options.WorkingDir,
      });

      // Start exec and collect output
      const stream = await exec.start({ Detach: false, Tty: options.Tty ?? false });

      let stdout = "";
      let stderr = "";

      // Collect output from stream
      await new Promise<void>((resolve, reject) => {
        if (options.Tty) {
          // In TTY mode, stdout and stderr are combined
          stream.on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
          });
        } else {
          // In non-TTY mode, Docker multiplexes stdout/stderr
          this.docker.modem.demuxStream(
            stream,
            {
              write: (chunk: Buffer) => {
                stdout += chunk.toString();
              },
            } as Writable,
            {
              write: (chunk: Buffer) => {
                stderr += chunk.toString();
              },
            } as Writable
          );
        }

        stream.on("end", () => resolve());
        stream.on("error", (err: Error) => reject(err));
      });

      // Get exit code
      const inspectResult = await exec.inspect();
      const exitCode = inspectResult.ExitCode ?? 0;

      return { exitCode, stdout, stderr };
    } catch (error) {
      throw new Error(
        `Failed to exec in container ${containerId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get container logs as a stream
   * @param containerId - Docker container ID
   * @param options - Log options
   * @returns Readable stream of log data
   */
  async getLogs(containerId: string, options: DockerLogsOptions = {}): Promise<Readable> {
    try {
      const container = this.docker.getContainer(containerId);

      // Build log options - dockerode has strict type checking for follow
      const logOptions: Record<string, unknown> = {
        stdout: options.stdout ?? true,
        stderr: options.stderr ?? true,
        timestamps: options.timestamps ?? false,
      };

      if (options.follow !== undefined) {
        logOptions.follow = options.follow;
      }

      if (options.tail !== undefined) {
        logOptions.tail = options.tail;
      }

      const logStream = (await container.logs(logOptions)) as unknown as Readable;

      return logStream;
    } catch (error) {
      throw new Error(
        `Failed to get logs for container ${containerId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
