import { afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock WebSocket globally
beforeAll(() => {
  global.WebSocket = vi.fn(() => ({
    close: vi.fn(),
    send: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    readyState: 1,
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  })) as any;
});

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
  root: null,
  rootMargin: '',
  thresholds: [],
  takeRecords: () => [],
})) as any;

// Mock ResizeObserver
global.ResizeObserver = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
})) as any;

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock API responses
export const mockApiResponses = {
  workItems: [
    {
      id: '1',
      title: 'Test work item',
      status: 'PENDING',
      priority: 'high',
      createdAt: new Date().toISOString(),
    },
    {
      id: '2',
      title: 'Another work item',
      status: 'IN_PROGRESS',
      priority: 'medium',
      createdAt: new Date().toISOString(),
    },
  ],
  workers: [
    {
      id: 'worker-1',
      name: 'Test Worker',
      status: 'active',
      tasksCompleted: 100,
      currentTask: 'Processing data',
    },
    {
      id: 'worker-2',
      name: 'Another Worker',
      status: 'idle',
      tasksCompleted: 50,
      currentTask: null,
    },
  ],
};

// Helper to create a mock WebSocket instance
export function createMockWebSocket() {
  const listeners: Record<string, Function[]> = {};

  return {
    close: vi.fn(),
    send: vi.fn(),
    addEventListener: vi.fn((event: string, handler: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),
    removeEventListener: vi.fn((event: string, handler: Function) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((h) => h !== handler);
      }
    }),
    triggerEvent: (event: string, data: any) => {
      if (listeners[event]) {
        listeners[event].forEach((handler) => handler(data));
      }
    },
    readyState: 1,
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  };
}
