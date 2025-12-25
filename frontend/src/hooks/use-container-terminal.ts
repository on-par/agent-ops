import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE } from '../lib/api';

/**
 * WebSocket connection status
 */
export type TerminalStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Terminal resize dimensions
 */
export interface TerminalSize {
  rows: number;
  cols: number;
}

/**
 * WebSocket message types for terminal communication
 */
interface TerminalMessage {
  type: 'data' | 'resize';
  data?: string;
  size?: TerminalSize;
}

/**
 * Options for terminal connection
 */
export interface UseContainerTerminalOptions {
  /**
   * Whether to automatically reconnect on disconnect
   * @default true
   */
  autoReconnect?: boolean;

  /**
   * Delay before reconnecting in milliseconds
   * @default 1000
   */
  reconnectDelay?: number;

  /**
   * Initial terminal size
   */
  initialSize?: TerminalSize;
}

/**
 * Hook for WebSocket-based container terminal interaction
 *
 * @param containerId - The ID of the container to connect to
 * @param options - Configuration options for terminal connection
 * @returns Terminal connection status and control functions
 *
 * @example
 * ```tsx
 * const { status, send, resize, onData } = useContainerTerminal(containerId);
 *
 * useEffect(() => {
 *   return onData((data) => {
 *     console.log('Received:', data);
 *   });
 * }, [onData]);
 *
 * const handleInput = (key: string) => {
 *   send(key);
 * };
 * ```
 */
export function useContainerTerminal(
  containerId: string | null,
  options: UseContainerTerminalOptions = {}
) {
  const {
    autoReconnect = true,
    reconnectDelay = 1000,
    initialSize = { rows: 24, cols: 80 },
  } = options;

  const [status, setStatus] = useState<TerminalStatus>('disconnected');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const dataCallbackRef = useRef<((data: string) => void) | null>(null);

  /**
   * Send data to the terminal
   */
  const send = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message: TerminalMessage = {
        type: 'data',
        data,
      };
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  /**
   * Send resize command to the terminal
   */
  const resize = useCallback((size: TerminalSize) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message: TerminalMessage = {
        type: 'resize',
        size,
      };
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  /**
   * Register a callback for received data
   */
  const onData = useCallback((callback: (data: string) => void) => {
    dataCallbackRef.current = callback;

    // Return cleanup function
    return () => {
      if (dataCallbackRef.current === callback) {
        dataCallbackRef.current = null;
      }
    };
  }, []);

  /**
   * Connect to the WebSocket
   */
  const connect = useCallback(() => {
    if (!containerId) {
      setStatus('disconnected');
      return;
    }

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setStatus('connecting');

    try {
      // Convert http/https to ws/wss
      const wsBase = API_BASE.replace(/^http/, 'ws');
      const url = `${wsBase}/api/containers/${containerId}/terminal`;
      const ws = new WebSocket(url);

      ws.onopen = () => {
        setStatus('connected');
        reconnectAttemptsRef.current = 0;

        // Send initial resize
        const message: TerminalMessage = {
          type: 'resize',
          size: initialSize,
        };
        ws.send(JSON.stringify(message));
      };

      ws.onmessage = (event) => {
        try {
          // Handle both text and binary data
          let data: string;

          if (typeof event.data === 'string') {
            // Try to parse as JSON message first
            try {
              const message = JSON.parse(event.data);
              if (message.type === 'data' && message.data) {
                data = message.data;
              } else {
                data = event.data;
              }
            } catch {
              // If not JSON, treat as raw data
              data = event.data;
            }
          } else if (event.data instanceof Blob) {
            // Handle binary data
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === 'string' && dataCallbackRef.current) {
                dataCallbackRef.current(reader.result);
              }
            };
            reader.readAsText(event.data);
            return;
          } else {
            return;
          }

          if (dataCallbackRef.current) {
            dataCallbackRef.current(data);
          }
        } catch (error) {
          console.error('Failed to process WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setStatus('error');
      };

      ws.onclose = () => {
        setStatus('disconnected');

        // Auto-reconnect with exponential backoff
        if (autoReconnect) {
          const delay = Math.min(
            reconnectDelay * Math.pow(2, reconnectAttemptsRef.current),
            30000 // Max 30 seconds
          );
          reconnectAttemptsRef.current += 1;

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      setStatus('error');
    }
  }, [containerId, autoReconnect, reconnectDelay, initialSize]);

  /**
   * Disconnect from the WebSocket
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setStatus('disconnected');
    reconnectAttemptsRef.current = 0;
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    status,
    send,
    resize,
    onData,
    reconnect: connect,
  };
}
