import type { FastifyPluginAsync } from "fastify";
import { broadcaster } from "../lib/broadcaster.js";
import type { ServerMessage, RoomType } from "../types/ws.js";

/**
 * WebSocket plugin for Fastify
 * Provides WebSocket connection management and message handling
 */
const websocketPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.log.info("Initializing WebSocket plugin");

  // Decorate fastify instance with WebSocket utilities
  fastify.decorate("websocket", {
    getConnectionCount: () => broadcaster.getConnectionCount(),
    getActiveRooms: () => broadcaster.getActiveRooms(),
    broadcastToAll: (message: ServerMessage) =>
      broadcaster.broadcastToAll(message),
    broadcastToRoom: (room: RoomType, message: ServerMessage) =>
      broadcaster.broadcastToRoom(room, message),
  });
};

// Export the plugin
export default websocketPlugin;

// Type augmentation for Fastify
declare module "fastify" {
  interface FastifyInstance {
    websocket: {
      getConnectionCount: () => number;
      getActiveRooms: () => Set<RoomType>;
      broadcastToAll: (message: ServerMessage) => void;
      broadcastToRoom: (room: RoomType, message: ServerMessage) => void;
    };
  }
}
