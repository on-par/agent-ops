// WebSocket hook for real-time agent updates

import { useEffect, useCallback, useRef } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";
import { useQueryClient } from "@tanstack/react-query";
import type { WebSocketMessage } from "../types";
import { useWorkItemStore } from "../stores/workItemStore";
import { useWorkerStore } from "../stores/workerStore";
import { useUIStore } from "../stores/uiStore";
import { workItemKeys } from "./useWorkItems";
import { workerKeys } from "./useWorkers";
import { traceKeys } from "./useTraces";

// ============================================================================
// Configuration
// ============================================================================

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:3000/ws";

// Reconnection configuration
const WS_OPTIONS = {
  shouldReconnect: () => true,
  reconnectAttempts: 10,
  reconnectInterval: 3000,
  heartbeat: {
    message: JSON.stringify({ type: "ping" }),
    returnMessage: JSON.stringify({ type: "pong" }),
    timeout: 60000,
    interval: 25000,
  },
};

// ============================================================================
// Hook
// ============================================================================

export interface UseAgentSocketOptions {
  enabled?: boolean;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Event) => void;
}

export function useAgentSocket(options: UseAgentSocketOptions = {}) {
  const { enabled = true, onConnected, onDisconnected, onError } = options;

  const queryClient = useQueryClient();
  const reconnectAttempts = useRef(0);

  // Store actions
  const updateWorkItem = useWorkItemStore((state) => state.updateItem);
  const updateWorker = useWorkerStore((state) => state.updateWorker);
  const updateWorkerStatus = useWorkerStore((state) => state.updateWorkerStatus);
  const updateWorkerMetrics = useWorkerStore(
    (state) => state.updateWorkerMetrics
  );
  const addNotification = useUIStore((state) => state.addNotification);

  // Message handler
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);

        switch (message.type) {
          case "agent_update": {
            const { workerId, status, metrics } = message.payload;

            // Update worker status
            if (status) {
              updateWorkerStatus(workerId, status);
            }

            // Update worker metrics
            if (metrics) {
              updateWorkerMetrics(workerId, metrics);
            }

            // Invalidate worker queries to refetch fresh data
            queryClient.invalidateQueries({
              queryKey: workerKeys.detail(workerId),
            });

            break;
          }

          case "work_item_update": {
            const { workItemId, status, updates } = message.payload;

            // Update work item in store
            updateWorkItem(workItemId, { status, ...updates });

            // Invalidate work item queries
            queryClient.invalidateQueries({
              queryKey: workItemKeys.detail(workItemId),
            });
            queryClient.invalidateQueries({
              queryKey: workItemKeys.lists(),
            });

            break;
          }

          case "trace": {
            const trace = message.payload;

            // Invalidate trace queries to include new trace
            queryClient.invalidateQueries({
              queryKey: traceKeys.lists(),
            });

            if (trace.workerId) {
              queryClient.invalidateQueries({
                queryKey: traceKeys.byWorker(trace.workerId),
              });
            }

            if (trace.workItemId) {
              queryClient.invalidateQueries({
                queryKey: traceKeys.byWorkItem(trace.workItemId),
              });
            }

            // Show notification for errors or approval requests
            if (trace.eventType === "error") {
              addNotification({
                type: "error",
                title: "Agent Error",
                message: `Worker ${trace.workerId || "unknown"} encountered an error`,
              });
            } else if (trace.eventType === "approval_required") {
              addNotification({
                type: "warning",
                title: "Approval Required",
                message: `Worker ${trace.workerId || "unknown"} is waiting for approval`,
              });
            }

            break;
          }

          case "error": {
            const { message: errorMessage, workerId, workItemId } =
              message.payload;

            addNotification({
              type: "error",
              title: "System Error",
              message: errorMessage,
            });

            // If error is related to a specific worker, invalidate its queries
            if (workerId) {
              queryClient.invalidateQueries({
                queryKey: workerKeys.detail(workerId),
              });
            }

            if (workItemId) {
              queryClient.invalidateQueries({
                queryKey: workItemKeys.detail(workItemId),
              });
            }

            break;
          }

          default:
            console.warn("Unknown WebSocket message type:", message);
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    },
    [
      queryClient,
      updateWorkItem,
      updateWorker,
      updateWorkerStatus,
      updateWorkerMetrics,
      addNotification,
    ]
  );

  // WebSocket connection
  const { sendMessage, lastMessage, readyState } = useWebSocket(
    enabled ? WS_URL : null,
    {
      ...WS_OPTIONS,
      onOpen: () => {
        console.log("WebSocket connected");
        reconnectAttempts.current = 0;
        onConnected?.();
      },
      onClose: () => {
        console.log("WebSocket disconnected");
        reconnectAttempts.current += 1;
        onDisconnected?.();
      },
      onError: (event) => {
        console.error("WebSocket error:", event);
        onError?.(event);
      },
    }
  );

  // Handle incoming messages
  useEffect(() => {
    if (lastMessage !== null) {
      handleMessage(lastMessage);
    }
  }, [lastMessage, handleMessage]);

  // Connection status
  const connectionStatus = {
    [ReadyState.CONNECTING]: "Connecting",
    [ReadyState.OPEN]: "Connected",
    [ReadyState.CLOSING]: "Closing",
    [ReadyState.CLOSED]: "Disconnected",
    [ReadyState.UNINSTANTIATED]: "Uninstantiated",
  }[readyState];

  const isConnected = readyState === ReadyState.OPEN;

  return {
    sendMessage,
    connectionStatus,
    isConnected,
    readyState,
    reconnectAttempts: reconnectAttempts.current,
  };
}

// ============================================================================
// Utility hook for subscribing to specific worker updates
// ============================================================================

export function useWorkerSocket(workerId: string) {
  const socket = useAgentSocket();

  useEffect(() => {
    if (socket.isConnected && workerId) {
      // Send subscription message
      socket.sendMessage(
        JSON.stringify({
          type: "subscribe",
          payload: { workerId },
        })
      );

      return () => {
        // Unsubscribe on cleanup
        socket.sendMessage(
          JSON.stringify({
            type: "unsubscribe",
            payload: { workerId },
          })
        );
      };
    }
  }, [socket, workerId, socket.isConnected]);

  return socket;
}

// ============================================================================
// Utility hook for subscribing to specific work item updates
// ============================================================================

export function useWorkItemSocket(workItemId: string) {
  const socket = useAgentSocket();

  useEffect(() => {
    if (socket.isConnected && workItemId) {
      // Send subscription message
      socket.sendMessage(
        JSON.stringify({
          type: "subscribe",
          payload: { workItemId },
        })
      );

      return () => {
        // Unsubscribe on cleanup
        socket.sendMessage(
          JSON.stringify({
            type: "unsubscribe",
            payload: { workItemId },
          })
        );
      };
    }
  }, [socket, workItemId, socket.isConnected]);

  return socket;
}
