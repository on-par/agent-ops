import type { FastifyPluginAsync } from "fastify";
import { v4 as uuidv4 } from "uuid";
import { broadcaster } from "../lib/broadcaster.js";
import type {
  ClientMessage,
  ServerMessage,
  WebSocketConnection,
  RoomType,
  InitialState,
} from "../types/ws.js";
import type { DrizzleDatabase } from "../db/index.js";
import { workItems, workers, traces } from "../db/schema.js";

export interface WebSocketRouteOptions {
  db: DrizzleDatabase;
}

/**
 * WebSocket routes for real-time updates
 */
const wsRoutes: FastifyPluginAsync<WebSocketRouteOptions> = async (
  fastify,
  options
) => {
  const { db } = options;

  fastify.get(
    "/ws",
    { websocket: true },
    async (socket, request) => {
      const connectionId = uuidv4();
      fastify.log.info(`WebSocket connection established: ${connectionId}`);

      // Create connection object
      const connection: WebSocketConnection = {
        id: connectionId,
        socket,
        rooms: new Set(["global"]), // Subscribe to global room by default
      };

      // Register connection with broadcaster
      broadcaster.addConnection(connection);

      // Helper function to send messages
      const sendMessage = (message: ServerMessage): void => {
        try {
          socket.send(JSON.stringify(message));
        } catch (error) {
          fastify.log.error(
            { error },
            `Failed to send message to ${connectionId}`
          );
        }
      };

      // Send initial state
      try {
        const [allWorkers, allWorkItems, allTraces] = await Promise.all([
          db.select().from(workers).all(),
          db.select().from(workItems).all(),
          db
            .select()
            .from(traces)
            .orderBy(traces.timestamp)
            .limit(100) // Limit initial traces to last 100
            .all(),
        ]);

        const initialState: InitialState = {
          workers: allWorkers,
          workItems: allWorkItems,
          traces: allTraces,
        };

        sendMessage({
          type: "initial_state",
          data: initialState,
        });

        fastify.log.info(`Sent initial state to connection ${connectionId}`);
      } catch (error) {
        fastify.log.error({ error }, "Failed to send initial state");
        sendMessage({
          type: "error",
          message: "Failed to load initial state",
        });
      }

      // Handle incoming messages
      socket.on("message", (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as ClientMessage;

          switch (message.type) {
            case "ping":
              sendMessage({ type: "pong" });
              break;

            case "subscribe": {
              const room = message.room as RoomType;
              broadcaster.subscribe(connectionId, room);
              fastify.log.info(
                `Connection ${connectionId} subscribed to room: ${room}`
              );
              break;
            }

            case "unsubscribe": {
              const room = message.room as RoomType;
              broadcaster.unsubscribe(connectionId, room);
              fastify.log.info(
                `Connection ${connectionId} unsubscribed from room: ${room}`
              );
              break;
            }

            default:
              fastify.log.warn("Unknown message type received:", message);
              sendMessage({
                type: "error",
                message: "Unknown message type",
              });
          }
        } catch (error) {
          fastify.log.error({ error }, "Error handling client message");
          sendMessage({
            type: "error",
            message: "Invalid message format",
          });
        }
      });

      // Handle connection close
      socket.on("close", () => {
        fastify.log.info(`WebSocket connection closed: ${connectionId}`);
        broadcaster.removeConnection(connectionId);
      });

      // Handle errors
      socket.on("error", (error: Error) => {
        fastify.log.error(
          { error },
          `WebSocket error on connection ${connectionId}`
        );
        broadcaster.removeConnection(connectionId);
      });
    }
  );

  // Health check endpoint for WebSocket status
  fastify.get("/ws/status", async () => {
    return {
      connections: broadcaster.getConnectionCount(),
      activeRooms: Array.from(broadcaster.getActiveRooms()),
    };
  });
};

export default wsRoutes;
