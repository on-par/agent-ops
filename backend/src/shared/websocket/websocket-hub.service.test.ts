import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  WebSocketHubService,
  type WebSocketConnection,
  type WebSocketEvent,
} from "./websocket-hub.service.js";
import type { WorkerStatus } from '../db/schema.js';

/**
 * Mock WebSocket connection for testing
 */
class MockWebSocketConnection implements WebSocketConnection {
  public sentMessages: string[] = [];
  public readyState: number = 1; // OPEN

  send(data: string): void {
    if (this.readyState !== 1) {
      throw new Error("WebSocket is not open");
    }
    this.sentMessages.push(data);
  }

  close(): void {
    this.readyState = 3; // CLOSED
  }

  getSentEvents(): WebSocketEvent[] {
    return this.sentMessages.map((msg) => JSON.parse(msg) as WebSocketEvent);
  }

  clearSentMessages(): void {
    this.sentMessages = [];
  }
}

describe("WebSocketHubService", () => {
  let hub: WebSocketHubService;

  beforeEach(() => {
    hub = new WebSocketHubService();
  });

  describe("Client Registration", () => {
    it("should register a new client", () => {
      const connection = new MockWebSocketConnection();
      hub.registerClient("client-1", connection);

      const clients = hub.getConnectedClients();
      expect(clients).toContain("client-1");
      expect(clients).toHaveLength(1);
    });

    it("should replace existing client connection when registering with same ID", () => {
      const connection1 = new MockWebSocketConnection();
      const connection2 = new MockWebSocketConnection();

      hub.registerClient("client-1", connection1);
      hub.registerClient("client-1", connection2);

      const clients = hub.getConnectedClients();
      expect(clients).toHaveLength(1);
      expect(connection1.readyState).toBe(3); // First connection should be closed
    });

    it("should register multiple clients", () => {
      const connection1 = new MockWebSocketConnection();
      const connection2 = new MockWebSocketConnection();
      const connection3 = new MockWebSocketConnection();

      hub.registerClient("client-1", connection1);
      hub.registerClient("client-2", connection2);
      hub.registerClient("client-3", connection3);

      const clients = hub.getConnectedClients();
      expect(clients).toHaveLength(3);
      expect(clients).toEqual(
        expect.arrayContaining(["client-1", "client-2", "client-3"])
      );
    });
  });

  describe("Client Unregistration", () => {
    it("should unregister a client", () => {
      const connection = new MockWebSocketConnection();
      hub.registerClient("client-1", connection);

      hub.unregisterClient("client-1");

      const clients = hub.getConnectedClients();
      expect(clients).not.toContain("client-1");
      expect(clients).toHaveLength(0);
      expect(connection.readyState).toBe(3); // Connection should be closed
    });

    it("should handle unregistering non-existent client gracefully", () => {
      expect(() => hub.unregisterClient("non-existent")).not.toThrow();
    });

    it("should remove all subscriptions when unregistering client", () => {
      const connection = new MockWebSocketConnection();
      hub.registerClient("client-1", connection);
      hub.subscribe("client-1", "channel-1");
      hub.subscribe("client-1", "channel-2");

      hub.unregisterClient("client-1");

      const subscriptions = hub.getClientSubscriptions("client-1");
      expect(subscriptions).toHaveLength(0);
    });
  });

  describe("Channel Subscriptions", () => {
    it("should subscribe client to a channel", () => {
      const connection = new MockWebSocketConnection();
      hub.registerClient("client-1", connection);

      hub.subscribe("client-1", "channel-1");

      const subscriptions = hub.getClientSubscriptions("client-1");
      expect(subscriptions).toContain("channel-1");
      expect(subscriptions).toHaveLength(1);
    });

    it("should subscribe client to multiple channels", () => {
      const connection = new MockWebSocketConnection();
      hub.registerClient("client-1", connection);

      hub.subscribe("client-1", "channel-1");
      hub.subscribe("client-1", "channel-2");
      hub.subscribe("client-1", "channel-3");

      const subscriptions = hub.getClientSubscriptions("client-1");
      expect(subscriptions).toHaveLength(3);
      expect(subscriptions).toEqual(
        expect.arrayContaining(["channel-1", "channel-2", "channel-3"])
      );
    });

    it("should not duplicate subscriptions", () => {
      const connection = new MockWebSocketConnection();
      hub.registerClient("client-1", connection);

      hub.subscribe("client-1", "channel-1");
      hub.subscribe("client-1", "channel-1");
      hub.subscribe("client-1", "channel-1");

      const subscriptions = hub.getClientSubscriptions("client-1");
      expect(subscriptions).toHaveLength(1);
    });

    it("should handle subscribing non-existent client gracefully", () => {
      expect(() => hub.subscribe("non-existent", "channel-1")).not.toThrow();
    });

    it("should unsubscribe client from a channel", () => {
      const connection = new MockWebSocketConnection();
      hub.registerClient("client-1", connection);

      hub.subscribe("client-1", "channel-1");
      hub.subscribe("client-1", "channel-2");

      hub.unsubscribe("client-1", "channel-1");

      const subscriptions = hub.getClientSubscriptions("client-1");
      expect(subscriptions).not.toContain("channel-1");
      expect(subscriptions).toContain("channel-2");
      expect(subscriptions).toHaveLength(1);
    });

    it("should handle unsubscribing from non-subscribed channel gracefully", () => {
      const connection = new MockWebSocketConnection();
      hub.registerClient("client-1", connection);

      expect(() => hub.unsubscribe("client-1", "channel-1")).not.toThrow();
    });

    it("should return empty array for subscriptions of non-existent client", () => {
      const subscriptions = hub.getClientSubscriptions("non-existent");
      expect(subscriptions).toHaveLength(0);
    });
  });

  describe("Broadcasting", () => {
    it("should broadcast event to all connected clients", () => {
      const connection1 = new MockWebSocketConnection();
      const connection2 = new MockWebSocketConnection();
      const connection3 = new MockWebSocketConnection();

      hub.registerClient("client-1", connection1);
      hub.registerClient("client-2", connection2);
      hub.registerClient("client-3", connection3);

      const event: WebSocketEvent = {
        type: "agent:state_changed",
        timestamp: Date.now(),
        data: { workerId: "worker-1", status: "working" },
      };

      hub.broadcast(event);

      expect(connection1.sentMessages).toHaveLength(1);
      expect(connection2.sentMessages).toHaveLength(1);
      expect(connection3.sentMessages).toHaveLength(1);

      const receivedEvent1 = connection1.getSentEvents()[0];
      expect(receivedEvent1).toBeDefined();
      if (receivedEvent1) {
        expect(receivedEvent1.type).toBe("agent:state_changed");
        expect(receivedEvent1.data).toEqual({
          workerId: "worker-1",
          status: "working",
        });
      }
    });

    it("should not broadcast to closed connections", () => {
      const connection1 = new MockWebSocketConnection();
      const connection2 = new MockWebSocketConnection();
      connection2.close(); // Close second connection

      hub.registerClient("client-1", connection1);
      hub.registerClient("client-2", connection2);

      const event: WebSocketEvent = {
        type: "metrics:updated",
        timestamp: Date.now(),
        data: { workerId: "worker-1" },
      };

      hub.broadcast(event);

      expect(connection1.sentMessages).toHaveLength(1);
      expect(connection2.sentMessages).toHaveLength(0); // Closed connection should not receive
    });

    it("should handle broadcasting when no clients connected", () => {
      const event: WebSocketEvent = {
        type: "error",
        timestamp: Date.now(),
        data: { message: "Test error" },
      };

      expect(() => hub.broadcast(event)).not.toThrow();
    });
  });

  describe("Channel Broadcasting", () => {
    it("should broadcast to all clients subscribed to a channel", () => {
      const connection1 = new MockWebSocketConnection();
      const connection2 = new MockWebSocketConnection();
      const connection3 = new MockWebSocketConnection();

      hub.registerClient("client-1", connection1);
      hub.registerClient("client-2", connection2);
      hub.registerClient("client-3", connection3);

      hub.subscribe("client-1", "workItem:item-123");
      hub.subscribe("client-2", "workItem:item-123");
      // client-3 is not subscribed

      const event: WebSocketEvent = {
        type: "work_item:updated",
        timestamp: Date.now(),
        data: { workItemId: "item-123", status: "in_progress" },
        channel: "workItem:item-123",
      };

      hub.broadcastToChannel("workItem:item-123", event);

      expect(connection1.sentMessages).toHaveLength(1);
      expect(connection2.sentMessages).toHaveLength(1);
      expect(connection3.sentMessages).toHaveLength(0); // Not subscribed
    });

    it("should broadcast to 'all' channel subscribers", () => {
      const connection1 = new MockWebSocketConnection();
      const connection2 = new MockWebSocketConnection();
      const connection3 = new MockWebSocketConnection();

      hub.registerClient("client-1", connection1);
      hub.registerClient("client-2", connection2);
      hub.registerClient("client-3", connection3);

      hub.subscribe("client-1", "all");
      hub.subscribe("client-3", "all");

      const event: WebSocketEvent = {
        type: "agent:spawned",
        timestamp: Date.now(),
        data: { workerId: "worker-1" },
        channel: "all",
      };

      hub.broadcastToChannel("all", event);

      expect(connection1.sentMessages).toHaveLength(1);
      expect(connection2.sentMessages).toHaveLength(0); // Not subscribed to 'all'
      expect(connection3.sentMessages).toHaveLength(1);
    });

    it("should not broadcast to closed connections in channel", () => {
      const connection1 = new MockWebSocketConnection();
      const connection2 = new MockWebSocketConnection();

      hub.registerClient("client-1", connection1);
      hub.registerClient("client-2", connection2);

      hub.subscribe("client-1", "agent:worker-1");
      hub.subscribe("client-2", "agent:worker-1");

      connection2.close(); // Close second connection

      const event: WebSocketEvent = {
        type: "agent:state_changed",
        timestamp: Date.now(),
        data: { workerId: "worker-1" },
        channel: "agent:worker-1",
      };

      hub.broadcastToChannel("agent:worker-1", event);

      expect(connection1.sentMessages).toHaveLength(1);
      expect(connection2.sentMessages).toHaveLength(0);
    });

    it("should handle broadcasting to channel with no subscribers", () => {
      const event: WebSocketEvent = {
        type: "work_item:created",
        timestamp: Date.now(),
        data: { workItemId: "item-1" },
        channel: "workItem:item-1",
      };

      expect(() =>
        hub.broadcastToChannel("workItem:item-1", event)
      ).not.toThrow();
    });
  });

  describe("Send to Specific Client", () => {
    it("should send event to specific client", () => {
      const connection1 = new MockWebSocketConnection();
      const connection2 = new MockWebSocketConnection();

      hub.registerClient("client-1", connection1);
      hub.registerClient("client-2", connection2);

      const event: WebSocketEvent = {
        type: "approval:required",
        timestamp: Date.now(),
        data: { workItemId: "item-1", message: "Approval needed" },
      };

      hub.sendToClient("client-1", event);

      expect(connection1.sentMessages).toHaveLength(1);
      expect(connection2.sentMessages).toHaveLength(0);

      const receivedEvent = connection1.getSentEvents()[0];
      expect(receivedEvent).toBeDefined();
      if (receivedEvent) {
        expect(receivedEvent.type).toBe("approval:required");
      }
    });

    it("should not send to closed client connection", () => {
      const connection = new MockWebSocketConnection();
      connection.close();

      hub.registerClient("client-1", connection);

      const event: WebSocketEvent = {
        type: "error",
        timestamp: Date.now(),
        data: { message: "Error" },
      };

      hub.sendToClient("client-1", event);

      expect(connection.sentMessages).toHaveLength(0);
    });

    it("should handle sending to non-existent client gracefully", () => {
      const event: WebSocketEvent = {
        type: "metrics:updated",
        timestamp: Date.now(),
        data: {},
      };

      expect(() => hub.sendToClient("non-existent", event)).not.toThrow();
    });
  });

  describe("Helper Methods - Agent State Changes", () => {
    it("should notify agent state change", () => {
      const connection = new MockWebSocketConnection();
      hub.registerClient("client-1", connection);
      hub.subscribe("client-1", "agent:worker-1");

      hub.notifyAgentStateChange("worker-1", "idle", "working");

      expect(connection.sentMessages).toHaveLength(1);
      const event = connection.getSentEvents()[0];
      expect(event).toBeDefined();
      if (event) {
        expect(event.type).toBe("agent:state_changed");
        expect(event.channel).toBe("agent:worker-1");
        expect(event.data).toEqual({
          workerId: "worker-1",
          oldStatus: "idle",
          newStatus: "working",
        });
      }
    });

    it("should notify agent spawned", () => {
      const connection = new MockWebSocketConnection();
      hub.registerClient("client-1", connection);
      hub.subscribe("client-1", "all");

      hub.notifyAgentStateChange("worker-1", "idle", "idle");

      expect(connection.sentMessages).toHaveLength(1);
      const event = connection.getSentEvents()[0];
      expect(event).toBeDefined();
      if (event) {
        expect(event.type).toBe("agent:state_changed");
      }
    });

    it("should broadcast to both agent-specific and all channels", () => {
      const connection1 = new MockWebSocketConnection();
      const connection2 = new MockWebSocketConnection();

      hub.registerClient("client-1", connection1);
      hub.registerClient("client-2", connection2);

      hub.subscribe("client-1", "agent:worker-1");
      hub.subscribe("client-2", "all");

      hub.notifyAgentStateChange("worker-1", "working", "paused");

      expect(connection1.sentMessages).toHaveLength(1);
      expect(connection2.sentMessages).toHaveLength(1);
    });
  });

  describe("Helper Methods - Work Item Updates", () => {
    it("should notify work item update", () => {
      const connection = new MockWebSocketConnection();
      hub.registerClient("client-1", connection);
      hub.subscribe("client-1", "workItem:item-123");

      hub.notifyWorkItemUpdate("item-123", {
        status: "in_progress",
        title: "Updated title",
      });

      expect(connection.sentMessages).toHaveLength(1);
      const event = connection.getSentEvents()[0];
      expect(event).toBeDefined();
      if (event) {
        expect(event.type).toBe("work_item:updated");
        expect(event.channel).toBe("workItem:item-123");
        expect(event.data).toEqual({
          workItemId: "item-123",
          changes: {
            status: "in_progress",
            title: "Updated title",
          },
        });
      }
    });

    it("should broadcast work item updates to both specific and all channels", () => {
      const connection1 = new MockWebSocketConnection();
      const connection2 = new MockWebSocketConnection();

      hub.registerClient("client-1", connection1);
      hub.registerClient("client-2", connection2);

      hub.subscribe("client-1", "workItem:item-123");
      hub.subscribe("client-2", "all");

      hub.notifyWorkItemUpdate("item-123", { status: "done" });

      expect(connection1.sentMessages).toHaveLength(1);
      expect(connection2.sentMessages).toHaveLength(1);
    });
  });

  describe("Helper Methods - Metrics Updates", () => {
    it("should notify metrics update", () => {
      const connection = new MockWebSocketConnection();
      hub.registerClient("client-1", connection);
      hub.subscribe("client-1", "agent:worker-1");

      const metrics = {
        tokensUsed: 1500,
        costUsd: 0.05,
        toolCalls: 10,
        contextWindowUsed: 25000,
        contextWindowLimit: 200000,
        errors: 0,
      };

      hub.notifyMetricsUpdate("worker-1", metrics);

      expect(connection.sentMessages).toHaveLength(1);
      const event = connection.getSentEvents()[0];
      expect(event).toBeDefined();
      if (event) {
        expect(event.type).toBe("metrics:updated");
        expect(event.channel).toBe("agent:worker-1");
        expect(event.data).toEqual({
          workerId: "worker-1",
          metrics,
        });
      }
    });

    it("should broadcast metrics to both agent-specific and all channels", () => {
      const connection1 = new MockWebSocketConnection();
      const connection2 = new MockWebSocketConnection();

      hub.registerClient("client-1", connection1);
      hub.registerClient("client-2", connection2);

      hub.subscribe("client-1", "agent:worker-1");
      hub.subscribe("client-2", "all");

      const metrics = {
        tokensUsed: 1500,
        costUsd: 0.05,
        toolCalls: 10,
        contextWindowUsed: 25000,
        contextWindowLimit: 200000,
        errors: 0,
      };

      hub.notifyMetricsUpdate("worker-1", metrics);

      expect(connection1.sentMessages).toHaveLength(1);
      expect(connection2.sentMessages).toHaveLength(1);
    });
  });

  describe("Error Handling", () => {
    it("should handle connection.send errors gracefully", () => {
      const connection = new MockWebSocketConnection();
      vi.spyOn(connection, "send").mockImplementation(() => {
        throw new Error("Network error");
      });

      hub.registerClient("client-1", connection);

      const event: WebSocketEvent = {
        type: "error",
        timestamp: Date.now(),
        data: { message: "Test" },
      };

      expect(() => hub.sendToClient("client-1", event)).not.toThrow();
    });

    it("should handle connection.close errors gracefully", () => {
      const connection = new MockWebSocketConnection();
      vi.spyOn(connection, "close").mockImplementation(() => {
        throw new Error("Close error");
      });

      hub.registerClient("client-1", connection);

      expect(() => hub.unregisterClient("client-1")).not.toThrow();
    });
  });

  describe("Complex Scenarios", () => {
    it("should handle multiple clients with mixed subscriptions", () => {
      const connection1 = new MockWebSocketConnection();
      const connection2 = new MockWebSocketConnection();
      const connection3 = new MockWebSocketConnection();

      hub.registerClient("client-1", connection1);
      hub.registerClient("client-2", connection2);
      hub.registerClient("client-3", connection3);

      // Client 1: subscribes to specific agent
      hub.subscribe("client-1", "agent:worker-1");

      // Client 2: subscribes to all
      hub.subscribe("client-2", "all");

      // Client 3: subscribes to specific work item
      hub.subscribe("client-3", "workItem:item-123");

      // Send agent update
      hub.notifyAgentStateChange("worker-1", "idle", "working");

      expect(connection1.sentMessages).toHaveLength(1); // Subscribed to agent
      expect(connection2.sentMessages).toHaveLength(1); // Subscribed to all
      expect(connection3.sentMessages).toHaveLength(0); // Not relevant

      // Clear messages
      connection1.clearSentMessages();
      connection2.clearSentMessages();
      connection3.clearSentMessages();

      // Send work item update
      hub.notifyWorkItemUpdate("item-123", { status: "done" });

      expect(connection1.sentMessages).toHaveLength(0); // Not subscribed to work items
      expect(connection2.sentMessages).toHaveLength(1); // Subscribed to all
      expect(connection3.sentMessages).toHaveLength(1); // Subscribed to this work item
    });

    it("should clean up properly when client reconnects", () => {
      const connection1 = new MockWebSocketConnection();
      const connection2 = new MockWebSocketConnection();

      hub.registerClient("client-1", connection1);
      hub.subscribe("client-1", "channel-1");
      hub.subscribe("client-1", "channel-2");

      // Client reconnects with new connection
      hub.registerClient("client-1", connection2);

      expect(connection1.readyState).toBe(3); // Old connection closed
      expect(hub.getConnectedClients()).toHaveLength(1);

      // Subscriptions should be preserved
      const subscriptions = hub.getClientSubscriptions("client-1");
      expect(subscriptions).toHaveLength(2);
    });
  });
});
