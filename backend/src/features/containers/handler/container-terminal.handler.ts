import type {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyRequest,
} from "fastify";
import type { WebSocket } from "ws";
import type { DrizzleDatabase } from "../../../shared/db/index.js";
import type { Config } from "../../../shared/config.js";
import { ContainerManagerService } from "../services/container-manager.service.js";
import { ContainerTerminalService } from "../services/container-terminal.service.js";
import type { TerminalSession } from "../types/terminal-session.types.js";

export interface ContainerTerminalHandlerOptions extends FastifyPluginOptions {
  db: DrizzleDatabase;
  config: Config;
  containerService?: ContainerManagerService;
}

/**
 * Terminal resize message structure
 */
interface TerminalResizeMessage {
  type: "resize";
  cols: number;
  rows: number;
}

/**
 * Container Terminal WebSocket Routes
 * Provides interactive terminal access to containers via WebSocket
 */
export async function containerTerminalHandler(
  app: FastifyInstance,
  options: ContainerTerminalHandlerOptions
): Promise<void> {
  const { db, config } = options;

  // Initialize container manager service (or use injected one for testing)
  const containerService = options.containerService ?? new ContainerManagerService(db);

  // Initialize terminal service
  const terminalService = new ContainerTerminalService(
    (containerService as any).dockerClient
  );

  /**
   * GET /:id/terminal - WebSocket endpoint for interactive terminal
   * Upgrades to WebSocket and provides PTY access to container
   */
  app.get(
    "/:id/terminal",
    { websocket: true },
    async (socket: WebSocket, request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      let session: TerminalSession | null = null;

      try {
        // Check if container exists
        const container = await containerService.getContainerStatus(id);
        if (!container) {
          socket.close(1008, "Container not found");
          return;
        }

        // Attach terminal to container
        session = await terminalService.attachTerminal(container.containerId);

        // Relay data from container to WebSocket client
        terminalService.onTerminalData(session, (data: Buffer) => {
          try {
            // Send as binary frame
            socket.send(data);
          } catch (error) {
            // WebSocket may be closed, ignore send errors
          }
        });

        // Handle terminal session end
        terminalService.onTerminalEnd(session, () => {
          socket.close(1000, "Terminal session ended");
        });

        // Handle messages from WebSocket client
        socket.on("message", (message: Buffer) => {
          if (!session) return;

          try {
            // Try to parse as JSON for control messages
            const messageStr = message.toString();
            const parsed = JSON.parse(messageStr) as TerminalResizeMessage;

            if (parsed.type === "resize" && parsed.cols && parsed.rows) {
              // Handle resize message
              terminalService.resizeTerminal(session, parsed.cols, parsed.rows);
              return;
            }
          } catch {
            // Not JSON or parsing failed, treat as stdin data
          }

          // Relay stdin to container
          terminalService.writeToTerminal(session, message);
        });

        // Handle WebSocket close
        socket.on("close", () => {
          if (session) {
            terminalService.detachTerminal(session);
            session = null;
          }
        });

        // Handle WebSocket errors
        socket.on("error", (error: Error) => {
          app.log.error({ error, containerId: id }, "WebSocket terminal error");
          if (session) {
            terminalService.detachTerminal(session);
            session = null;
          }
        });

      } catch (error) {
        // Failed to attach terminal
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        app.log.error({ error, containerId: id }, "Failed to attach terminal");

        if (session) {
          terminalService.detachTerminal(session);
        }

        socket.close(1011, errorMessage);
      }
    }
  );
}
