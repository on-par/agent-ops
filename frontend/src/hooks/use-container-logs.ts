import { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE } from '../lib/api';

/**
 * Log level types
 */
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Container log entry
 */
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
}

/**
 * Connection status for SSE stream
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Options for log streaming
 */
export interface UseContainerLogsOptions {
  /**
   * Maximum number of log entries to keep in memory
   * @default 1000
   */
  maxEntries?: number;

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
}

/**
 * Hook for streaming container logs via Server-Sent Events (SSE)
 *
 * @param containerId - The ID of the container to stream logs from
 * @param options - Configuration options for log streaming
 * @returns Log entries array and connection status
 *
 * @example
 * ```tsx
 * const { logs, status, clearLogs } = useContainerLogs(containerId);
 *
 * if (status === 'error') {
 *   return <div>Failed to connect to log stream</div>;
 * }
 *
 * return (
 *   <div>
 *     {logs.map((log, i) => (
 *       <div key={i}>{log.message}</div>
 *     ))}
 *   </div>
 * );
 * ```
 */
export function useContainerLogs(
  containerId: string | null,
  options: UseContainerLogsOptions = {}
) {
  const {
    maxEntries = 1000,
    autoReconnect = true,
    reconnectDelay = 1000,
  } = options;

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  /**
   * Clear all log entries
   */
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  /**
   * Parse log entry from SSE message
   */
  const parseLogEntry = useCallback((data: string): LogEntry | null => {
    try {
      const parsed = JSON.parse(data);
      return {
        timestamp: new Date(parsed.timestamp),
        level: parsed.level || 'info',
        message: parsed.message || '',
      };
    } catch (error) {
      console.error('Failed to parse log entry:', error);
      return null;
    }
  }, []);

  /**
   * Add a new log entry, maintaining maxEntries limit
   */
  const addLogEntry = useCallback((entry: LogEntry) => {
    setLogs((prev) => {
      const updated = [...prev, entry];
      // Keep only the most recent maxEntries
      if (updated.length > maxEntries) {
        return updated.slice(updated.length - maxEntries);
      }
      return updated;
    });
  }, [maxEntries]);

  /**
   * Connect to the SSE stream
   */
  const connect = useCallback(() => {
    if (!containerId) {
      setStatus('disconnected');
      return;
    }

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setStatus('connecting');

    try {
      const url = `${API_BASE}/api/containers/${containerId}/logs/stream`;
      const eventSource = new EventSource(url);

      eventSource.onopen = () => {
        setStatus('connected');
        reconnectAttemptsRef.current = 0;
      };

      eventSource.onmessage = (event) => {
        const entry = parseLogEntry(event.data);
        if (entry) {
          addLogEntry(entry);
        }
      };

      eventSource.onerror = () => {
        setStatus('error');
        eventSource.close();

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

      eventSourceRef.current = eventSource;
    } catch (error) {
      console.error('Failed to create EventSource:', error);
      setStatus('error');
    }
  }, [containerId, autoReconnect, reconnectDelay, parseLogEntry, addLogEntry]);

  /**
   * Disconnect from the SSE stream
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
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
    logs,
    status,
    clearLogs,
    reconnect: connect,
  };
}
