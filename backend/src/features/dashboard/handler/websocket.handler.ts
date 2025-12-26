import { randomUUID } from "crypto";
import type { FastifyInstance, FastifyPluginOptions, FastifyRequest } from "fastify";
import type { WebSocket } from "ws";
import type { WebSocketHubService } from "../../../shared/websocket/websocket-hub.service.js";

/**
 * WebSocket handler options
 */
export interface WebSocketHandlerOptions extends FastifyPluginOptions {
  hubService: WebSocketHubService;
}

/**
 * WebSocket Handler
 * Manages real-time connections for the dashboard
 * Provides:
 * - Client registration and lifecycle management
 * - Channel subscription/unsubscription
 * - Integration with WebSocketHubService for broadcasting
 *
 * Message Protocol:
 * Client -> Server:
 *   { action: "subscribe", channel: "channel-name" }
 *   { action: "unsubscribe", channel: "channel-name" }
 *
 * Server -> Client:
 *   { type: "agent:state_changed" | "work_item:created" | ... , timestamp: number, data: {...}, channel?: string }
 */
export async function websocketHandler(
  app: FastifyInstance,
  options: WebSocketHandlerOptions
): Promise<void> {
  const { hubService } = options;

  /**
   * GET /ws - WebSocket connection endpoint
   * Handles full lifecycle of WebSocket connections:
   * 1. Connection establishment with clientId generation
   * 2. Message parsing for subscribe/unsubscribe actions
   * 3. Graceful cleanup on disconnection
   */
  app.get(
    "/ws",
    { websocket: true },
    (socket: WebSocket, _request: FastifyRequest) => {
      // Generate unique client ID
      const clientId = randomUUID();

      // Register client with hub service
      hubService.registerClient(clientId, socket);

      /**
       * Handle incoming messages from client
       * Expected message format:
       * { action: "subscribe" | "unsubscribe", channel: string }
       */
      socket.on("message", (rawMessage: Buffer) => {
        try {
          const message = JSON.parse(rawMessage.toString());

          if (message.action === "subscribe" && message.channel) {
            // Subscribe client to channel
            hubService.subscribe(clientId, message.channel);
          } else if (message.action === "unsubscribe" && message.channel) {
            // Unsubscribe client from channel
            hubService.unsubscribe(clientId, message.channel);
          }
          // Silently ignore unknown actions or malformed messages
        } catch {
          // Silently ignore invalid JSON or parsing errors
          // This prevents malformed messages from crashing the handler
        }
      });

      /**
       * Handle client disconnection
       * Clean up client registration and subscriptions
       */
      socket.on("close", () => {
        hubService.unregisterClient(clientId);
      });

      /**
       * Handle WebSocket errors
       * Silently ignore to prevent one bad connection from affecting others
       */
      socket.on("error", () => {
        // Silently ignore errors
        // Connection cleanup is handled by "close" event
      });
    }
  );
}
