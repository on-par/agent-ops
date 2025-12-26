import type { DockerClientInterface } from "../interfaces/docker-client.interface.js";
import type { TerminalSession } from "../types/terminal-session.types.js";

/**
 * Service for managing interactive terminal sessions in Docker containers
 * Handles PTY allocation, stdin/stdout relay, and terminal resizing
 */
export class ContainerTerminalService {
  private dockerClient: DockerClientInterface;

  constructor(dockerClient: DockerClientInterface) {
    this.dockerClient = dockerClient;
  }

  /**
   * Attach an interactive terminal to a container
   * Creates a new exec instance with PTY and starts a shell
   *
   * @param containerId - Docker container ID to attach to
   * @returns Terminal session with stream for I/O
   */
  async attachTerminal(containerId: string): Promise<TerminalSession> {
    try {
      // Access internal Docker client methods for exec operations
      const dockerClient = this.dockerClient as any;

      // Create exec instance with PTY
      const exec = await dockerClient.execCreate(containerId, {
        Cmd: ["/bin/sh"],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
      });

      // Start exec and get stream
      const stream = await dockerClient.execStart(exec.id);

      return {
        containerId,
        execId: exec.id,
        stream,
        metadata: {
          createdAt: Date.now(),
        },
      };
    } catch (error) {
      throw new Error(
        `Failed to attach terminal to container ${containerId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Resize the terminal to new dimensions
   * Updates the PTY size for proper terminal rendering
   *
   * @param session - Active terminal session
   * @param cols - Number of columns
   * @param rows - Number of rows
   */
  async resizeTerminal(
    session: TerminalSession,
    cols: number,
    rows: number
  ): Promise<void> {
    try {
      const dockerClient = this.dockerClient as any;
      await dockerClient.execResize(session.execId, cols, rows);

      // Update session metadata
      if (session.metadata) {
        session.metadata.dimensions = { cols, rows };
      }
    } catch (error) {
      // Resize can fail if exec is not running, ignore these errors
      // Log in production but don't throw to avoid disrupting the session
    }
  }

  /**
   * Detach from terminal session and clean up resources
   * Closes the stream and releases Docker exec instance
   *
   * @param session - Terminal session to detach
   */
  detachTerminal(session: TerminalSession): void {
    try {
      session.stream.destroy();
    } catch (error) {
      // Stream may already be closed, ignore errors
    }
  }

  /**
   * Write data to the terminal (send stdin to container)
   *
   * @param session - Active terminal session
   * @param data - Data to write (user input)
   */
  writeToTerminal(session: TerminalSession, data: string | Buffer): void {
    session.stream.write(data);
  }

  /**
   * Register callback for terminal output data
   *
   * @param session - Active terminal session
   * @param handler - Callback to receive stdout/stderr data
   */
  onTerminalData(session: TerminalSession, handler: (data: Buffer) => void): void {
    session.stream.on("data", handler);
  }

  /**
   * Register callback for terminal session end
   *
   * @param session - Active terminal session
   * @param handler - Callback when session ends
   */
  onTerminalEnd(session: TerminalSession, handler: () => void): void {
    session.stream.on("end", handler);
  }
}
