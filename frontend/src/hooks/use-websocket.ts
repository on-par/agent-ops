/**
 * WebSocket integration hook for real-time updates
 * Handles connection, message parsing, and cache invalidation
 */

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import useWebSocket from 'react-use-websocket';
import { dashboardApi } from '../lib/api-dashboard';
import { workItemKeys } from './use-work-items';
import { workerKeys } from './use-workers';
import type { WebSocketMessage } from '../types/api';

/**
 * Hook for real-time updates via WebSocket
 * Handles connection status and message routing
 */
export function useRealtimeUpdates() {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  const wsUrl = dashboardApi.getWebSocketUrl();

  const { lastMessage, readyState } = useWebSocket(wsUrl, {
    shouldReconnect: () => true,
    reconnectAttempts: 10,
    reconnectInterval: (attemptNumber) =>
      Math.min(1000 * Math.pow(2, attemptNumber), 30000),
    onOpen: () => {
      setIsConnected(true);
    },
    onClose: () => {
      setIsConnected(false);
    },
  });

  // Parse and handle WebSocket messages
  useEffect(() => {
    if (lastMessage !== null) {
      try {
        const message: WebSocketMessage = JSON.parse(lastMessage.data);

        switch (message.type) {
          case 'work_item:created':
          case 'work_item:updated':
          case 'work_item:status_changed':
          case 'work_item:deleted':
            // Invalidate work items queries
            queryClient.invalidateQueries({ queryKey: workItemKeys.lists() });
            if (message.data?.id) {
              queryClient.invalidateQueries({
                queryKey: workItemKeys.detail(message.data.id as string),
              });
            }
            break;

          case 'agent:state_changed':
          case 'agent:spawned':
          case 'agent:terminated':
            // Invalidate worker queries
            queryClient.invalidateQueries({ queryKey: workerKeys.list() });
            if (message.data?.id) {
              queryClient.invalidateQueries({
                queryKey: workerKeys.detail(message.data.id as string),
              });
            }
            break;

          case 'metrics:updated':
            // Invalidate all relevant queries
            queryClient.invalidateQueries({ queryKey: workItemKeys.lists() });
            queryClient.invalidateQueries({ queryKey: workerKeys.list() });
            break;

          case 'error':
            console.error('WebSocket error:', message.data);
            break;

          default:
            // Handle other event types
            break;
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    }
  }, [lastMessage, queryClient]);

  // Update connection status based on readyState
  useEffect(() => {
    setIsConnected(readyState === WebSocket.OPEN);
  }, [readyState]);

  return { isConnected };
}
