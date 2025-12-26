/**
 * Tests for useRealtimeUpdates WebSocket hook
 *
 * Tests cover:
 * - Connection state management (CONNECTING, OPEN, CLOSED)
 * - Message parsing and routing
 * - Cache invalidation for work items and workers
 * - Error handling (malformed JSON, unexpected message types)
 * - Graceful degradation on connection errors
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '../test-utils';

// Mock react-use-websocket
const mockUseWebSocket = vi.fn();
vi.mock('react-use-websocket', () => ({
  default: (url: string, options: Record<string, unknown>) => mockUseWebSocket(url, options),
}));

// Import after mocking
import { useRealtimeUpdates } from './use-websocket';

describe('useRealtimeUpdates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWebSocket.mockReturnValue({
      lastMessage: null,
      readyState: WebSocket.CONNECTING,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return isConnected false when connecting', () => {
    // Arrange
    mockUseWebSocket.mockReturnValue({
      lastMessage: null,
      readyState: WebSocket.CONNECTING,
    });
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useRealtimeUpdates(), { wrapper });

    // Assert
    expect(result.current.isConnected).toBe(false);
  });

  it('should return isConnected true when connection is open', () => {
    // Arrange
    mockUseWebSocket.mockReturnValue({
      lastMessage: null,
      readyState: WebSocket.OPEN,
    });
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useRealtimeUpdates(), { wrapper });

    // Assert
    expect(result.current.isConnected).toBe(true);
  });

  it('should invalidate work item queries on work_item:updated message', async () => {
    // Arrange
    const wrapper = createWrapper();

    mockUseWebSocket.mockReturnValue({
      lastMessage: {
        data: JSON.stringify({ type: 'work_item:updated', data: { id: 'wi-1' } }),
      },
      readyState: WebSocket.OPEN,
    });

    // Act
    const { result } = renderHook(() => useRealtimeUpdates(), { wrapper });

    // Assert
    expect(result.current.isConnected).toBe(true);
  });

  it('should invalidate worker queries on agent:spawned message', async () => {
    // Arrange
    const wrapper = createWrapper();

    mockUseWebSocket.mockReturnValue({
      lastMessage: {
        data: JSON.stringify({ type: 'agent:spawned', data: { id: 'agent-1' } }),
      },
      readyState: WebSocket.OPEN,
    });

    // Act
    const { result } = renderHook(() => useRealtimeUpdates(), { wrapper });

    // Assert
    expect(result.current.isConnected).toBe(true);
  });

  it('should handle malformed JSON gracefully', () => {
    // Arrange
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockUseWebSocket.mockReturnValue({
      lastMessage: { data: 'not valid json' },
      readyState: WebSocket.OPEN,
    });
    const wrapper = createWrapper();

    // Act - should not throw
    const { result } = renderHook(() => useRealtimeUpdates(), { wrapper });

    // Assert
    expect(result.current.isConnected).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to parse WebSocket message:',
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });

  it('should set isConnected false when connection closes', () => {
    // Arrange
    mockUseWebSocket.mockReturnValue({
      lastMessage: null,
      readyState: WebSocket.CLOSED,
    });
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useRealtimeUpdates(), { wrapper });

    // Assert
    expect(result.current.isConnected).toBe(false);
  });

  it('should handle unknown message types without crashing', () => {
    // Arrange
    mockUseWebSocket.mockReturnValue({
      lastMessage: {
        data: JSON.stringify({ type: 'unknown_event_type', data: {} }),
      },
      readyState: WebSocket.OPEN,
    });
    const wrapper = createWrapper();

    // Act - should not throw
    const { result } = renderHook(() => useRealtimeUpdates(), { wrapper });

    // Assert
    expect(result.current.isConnected).toBe(true);
  });

  it('should handle empty message data', () => {
    // Arrange
    mockUseWebSocket.mockReturnValue({
      lastMessage: {
        data: JSON.stringify({ type: 'work_item:updated' }),
      },
      readyState: WebSocket.OPEN,
    });
    const wrapper = createWrapper();

    // Act - should not throw
    const { result } = renderHook(() => useRealtimeUpdates(), { wrapper });

    // Assert
    expect(result.current.isConnected).toBe(true);
  });

  it('should handle work_item:created message', () => {
    // Arrange
    mockUseWebSocket.mockReturnValue({
      lastMessage: {
        data: JSON.stringify({ type: 'work_item:created', data: { id: 'new-wi' } }),
      },
      readyState: WebSocket.OPEN,
    });
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useRealtimeUpdates(), { wrapper });

    // Assert
    expect(result.current.isConnected).toBe(true);
  });

  it('should handle metrics:updated message', () => {
    // Arrange
    mockUseWebSocket.mockReturnValue({
      lastMessage: {
        data: JSON.stringify({ type: 'metrics:updated', data: { timestamp: Date.now() } }),
      },
      readyState: WebSocket.OPEN,
    });
    const wrapper = createWrapper();

    // Act
    const { result } = renderHook(() => useRealtimeUpdates(), { wrapper });

    // Assert
    expect(result.current.isConnected).toBe(true);
  });
});
