import type {
  ServerMessage,
  WebSocketConnection,
  RoomType,
} from "../types/ws.js";
import type { WorkItem, Worker, Trace } from "../db/schema.js";

/**
 * Broadcaster service for WebSocket messages
 * Singleton pattern - use getInstance() to get the instance
 */
export class Broadcaster {
  private static instance: Broadcaster | null = null;
  private connections: Map<string, WebSocketConnection> = new Map();

  private constructor() {}

  static getInstance(): Broadcaster {
    if (!Broadcaster.instance) {
      Broadcaster.instance = new Broadcaster();
    }
    return Broadcaster.instance;
  }

  /**
   * Register a new WebSocket connection
   */
  addConnection(connection: WebSocketConnection): void {
    this.connections.set(connection.id, connection);
  }

  /**
   * Remove a WebSocket connection
   */
  removeConnection(connectionId: string): void {
    this.connections.delete(connectionId);
  }

  /**
   * Get a connection by ID
   */
  getConnection(connectionId: string): WebSocketConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Subscribe a connection to a room
   */
  subscribe(connectionId: string, room: RoomType): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.rooms.add(room);
    }
  }

  /**
   * Unsubscribe a connection from a room
   */
  unsubscribe(connectionId: string, room: RoomType): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.rooms.delete(room);
    }
  }

  /**
   * Send a message to a specific connection
   */
  private sendToConnection(
    connection: WebSocketConnection,
    message: ServerMessage
  ): void {
    try {
      connection.socket.send(JSON.stringify(message));
    } catch (error) {
      console.error(
        `Failed to send message to connection ${connection.id}:`,
        error
      );
    }
  }

  /**
   * Broadcast a message to all connections in a room
   */
  broadcastToRoom(room: RoomType, message: ServerMessage): void {
    for (const connection of this.connections.values()) {
      if (connection.rooms.has(room) || connection.rooms.has("global")) {
        this.sendToConnection(connection, message);
      }
    }
  }

  /**
   * Broadcast a message to all connected clients
   */
  broadcastToAll(message: ServerMessage): void {
    for (const connection of this.connections.values()) {
      this.sendToConnection(connection, message);
    }
  }

  /**
   * Broadcast worker update
   */
  broadcastWorkerUpdate(worker: Worker): void {
    const message: ServerMessage = {
      type: "worker_update",
      data: worker,
    };

    // Broadcast to global room and specific worker room
    this.broadcastToRoom("global", message);
    this.broadcastToRoom(`worker:${worker.id}`, message);
  }

  /**
   * Broadcast work item update
   */
  broadcastWorkItemUpdate(workItem: WorkItem): void {
    const message: ServerMessage = {
      type: "work_item_update",
      data: workItem,
    };

    // Broadcast to global room and specific work item room
    this.broadcastToRoom("global", message);
    this.broadcastToRoom(`work_item:${workItem.id}`, message);
  }

  /**
   * Broadcast trace event
   */
  broadcastTrace(trace: Trace): void {
    const message: ServerMessage = {
      type: "trace",
      data: trace,
    };

    // Broadcast to global room
    this.broadcastToRoom("global", message);

    // Also broadcast to specific worker and work item rooms if applicable
    if (trace.workerId) {
      this.broadcastToRoom(`worker:${trace.workerId}`, message);
    }
    if (trace.workItemId) {
      this.broadcastToRoom(`work_item:${trace.workItemId}`, message);
    }
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get all active rooms
   */
  getActiveRooms(): Set<RoomType> {
    const rooms = new Set<RoomType>();
    for (const connection of this.connections.values()) {
      for (const room of connection.rooms) {
        rooms.add(room);
      }
    }
    return rooms;
  }
}

// Export singleton instance
export const broadcaster = Broadcaster.getInstance();
