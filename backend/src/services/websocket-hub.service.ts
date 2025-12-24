import type { WorkerStatus, WorkItem } from "../db/schema.js";

/**
 * WebSocket event types for real-time communication
 */
export type WebSocketEventType =
  | "agent:state_changed"
  | "agent:spawned"
  | "agent:terminated"
  | "work_item:created"
  | "work_item:updated"
  | "work_item:status_changed"
  | "work_item:deleted"
  | "metrics:updated"
  | "error"
  | "approval:required"
  | "approval:resolved";

/**
 * Generic WebSocket connection interface
 * Framework-agnostic to work with any WebSocket library
 */
export interface WebSocketConnection {
  send(data: string): void;
  close(): void;
  readyState: number; // 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
}

/**
 * WebSocket event structure
 */
export interface WebSocketEvent {
  type: WebSocketEventType;
  timestamp: number;
  data: unknown;
  channel?: string;
}

/**
 * Worker metrics for WebSocket metrics update events
 */
export interface WebSocketWorkerMetrics {
  tokensUsed: number;
  costUsd: number;
  toolCalls: number;
  contextWindowUsed: number;
  contextWindowLimit: number;
  errors: number;
}

/**
 * Client registration data
 */
interface ClientData {
  connection: WebSocketConnection;
  subscriptions: Set<string>;
}

/**
 * WebSocket Hub Service
 *
 * Manages WebSocket connections and real-time event broadcasting for the agent-ops system.
 * This service handles:
 * - Client connection lifecycle (register/unregister)
 * - Channel-based pub/sub subscriptions
 * - Event broadcasting (global, channel-specific, and targeted)
 * - Helper methods for common event types (agent state, work items, metrics)
 *
 * Channel Conventions:
 * - "all" - Receives all events
 * - "agent:{workerId}" - Agent-specific events
 * - "workItem:{itemId}" - Work item-specific events
 *
 * The hub is framework-agnostic and works with any WebSocket library that implements
 * the WebSocketConnection interface.
 */
export class WebSocketHubService {
  private clients: Map<string, ClientData> = new Map();

  /**
   * Register a new WebSocket client
   * If a client with the same ID already exists, closes the old connection and replaces it
   *
   * @param clientId - Unique identifier for the client
   * @param connection - WebSocket connection object
   */
  registerClient(clientId: string, connection: WebSocketConnection): void {
    // If client already exists, close the old connection
    const existingClient = this.clients.get(clientId);
    if (existingClient) {
      this._safeClose(existingClient.connection);
    }

    // Register new client with empty subscriptions (preserve old subscriptions if reconnecting)
    this.clients.set(clientId, {
      connection,
      subscriptions: existingClient?.subscriptions ?? new Set(),
    });
  }

  /**
   * Unregister a WebSocket client
   * Closes the connection and removes all subscriptions
   *
   * @param clientId - Client identifier to unregister
   */
  unregisterClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this._safeClose(client.connection);
      this.clients.delete(clientId);
    }
  }

  /**
   * Subscribe a client to a channel
   * Channels allow filtering of events to interested parties only
   *
   * @param clientId - Client identifier
   * @param channel - Channel name (e.g., "all", "agent:worker-1", "workItem:item-123")
   */
  subscribe(clientId: string, channel: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.subscriptions.add(channel);
    }
  }

  /**
   * Unsubscribe a client from a channel
   *
   * @param clientId - Client identifier
   * @param channel - Channel name to unsubscribe from
   */
  unsubscribe(clientId: string, channel: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.subscriptions.delete(channel);
    }
  }

  /**
   * Broadcast an event to all connected clients
   *
   * @param event - Event to broadcast
   */
  broadcast(event: WebSocketEvent): void {
    const serialized = JSON.stringify(event);
    for (const [_clientId, client] of Array.from(this.clients.entries())) {
      this._safeSend(client.connection, serialized);
    }
  }

  /**
   * Broadcast an event to all clients subscribed to a specific channel
   *
   * @param channel - Channel name
   * @param event - Event to broadcast
   */
  broadcastToChannel(channel: string, event: WebSocketEvent): void {
    const serialized = JSON.stringify(event);
    for (const [_clientId, client] of Array.from(this.clients.entries())) {
      if (client.subscriptions.has(channel)) {
        this._safeSend(client.connection, serialized);
      }
    }
  }

  /**
   * Send an event to a specific client
   *
   * @param clientId - Target client identifier
   * @param event - Event to send
   */
  sendToClient(clientId: string, event: WebSocketEvent): void {
    const client = this.clients.get(clientId);
    if (client) {
      const serialized = JSON.stringify(event);
      this._safeSend(client.connection, serialized);
    }
  }

  /**
   * Get list of all connected client IDs
   *
   * @returns Array of client identifiers
   */
  getConnectedClients(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Get all channels a client is subscribed to
   *
   * @param clientId - Client identifier
   * @returns Array of channel names
   */
  getClientSubscriptions(clientId: string): string[] {
    const client = this.clients.get(clientId);
    return client ? Array.from(client.subscriptions) : [];
  }

  /**
   * Notify subscribers of an agent state change
   * Broadcasts to both agent-specific channel and "all" channel
   *
   * @param workerId - Worker/agent identifier
   * @param oldStatus - Previous worker status
   * @param newStatus - New worker status
   */
  notifyAgentStateChange(
    workerId: string,
    oldStatus: WorkerStatus,
    newStatus: WorkerStatus
  ): void {
    const event: WebSocketEvent = {
      type: "agent:state_changed",
      timestamp: Date.now(),
      data: {
        workerId,
        oldStatus,
        newStatus,
      },
      channel: `agent:${workerId}`,
    };

    // Broadcast to agent-specific channel
    this.broadcastToChannel(`agent:${workerId}`, event);

    // Also broadcast to "all" channel
    this.broadcastToChannel("all", event);
  }

  /**
   * Notify subscribers of a work item update
   * Broadcasts to both work item-specific channel and "all" channel
   *
   * @param workItemId - Work item identifier
   * @param changes - Partial work item with changed fields
   */
  notifyWorkItemUpdate(
    workItemId: string,
    changes: Partial<WorkItem>
  ): void {
    const event: WebSocketEvent = {
      type: "work_item:updated",
      timestamp: Date.now(),
      data: {
        workItemId,
        changes,
      },
      channel: `workItem:${workItemId}`,
    };

    // Broadcast to work item-specific channel
    this.broadcastToChannel(`workItem:${workItemId}`, event);

    // Also broadcast to "all" channel
    this.broadcastToChannel("all", event);
  }

  /**
   * Notify subscribers of worker metrics update
   * Broadcasts to both agent-specific channel and "all" channel
   *
   * @param workerId - Worker/agent identifier
   * @param metrics - Current worker metrics
   */
  notifyMetricsUpdate(workerId: string, metrics: WebSocketWorkerMetrics): void {
    const event: WebSocketEvent = {
      type: "metrics:updated",
      timestamp: Date.now(),
      data: {
        workerId,
        metrics,
      },
      channel: `agent:${workerId}`,
    };

    // Broadcast to agent-specific channel
    this.broadcastToChannel(`agent:${workerId}`, event);

    // Also broadcast to "all" channel
    this.broadcastToChannel("all", event);
  }

  /**
   * Safely send data to a WebSocket connection
   * Only sends if connection is OPEN (readyState === 1)
   * Catches and ignores errors to prevent one bad connection from affecting others
   *
   * @param connection - WebSocket connection
   * @param data - Serialized data to send
   */
  private _safeSend(connection: WebSocketConnection, data: string): void {
    try {
      if (connection.readyState === 1) {
        // OPEN
        connection.send(data);
      }
    } catch {
      // Silently ignore send errors (connection may be in bad state)
      // In production, you might want to log this
    }
  }

  /**
   * Safely close a WebSocket connection
   * Catches and ignores errors during close
   *
   * @param connection - WebSocket connection to close
   */
  private _safeClose(connection: WebSocketConnection): void {
    try {
      if (connection.readyState !== 3) {
        // Not already CLOSED
        connection.close();
      }
    } catch {
      // Silently ignore close errors
      // In production, you might want to log this
    }
  }
}
