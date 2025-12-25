/**
 * ContainerLogs component tests
 *
 * Tests the ContainerLogs component's rendering, filtering,
 * auto-scroll behavior, and user interactions.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContainerLogs } from './ContainerLogs';
import * as useContainerLogsModule from '../../hooks/use-container-logs';

// Mock the useContainerLogs hook
vi.mock('../../hooks/use-container-logs');

describe('ContainerLogs', () => {
  const mockClearLogs = vi.fn();
  const mockReconnect = vi.fn();

  const defaultMockReturn = {
    logs: [],
    status: 'connected' as const,
    clearLogs: mockClearLogs,
    reconnect: mockReconnect,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementation
    vi.spyOn(useContainerLogsModule, 'useContainerLogs').mockReturnValue(defaultMockReturn);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render empty state when no logs', () => {
    render(<ContainerLogs containerId="test-container-id" />);

    expect(screen.getByText('No logs yet')).toBeInTheDocument();
    expect(screen.getByText('Waiting for container output...')).toBeInTheDocument();
  });

  it('should render log entries with timestamps and levels', () => {
    const mockLogs = [
      {
        timestamp: new Date('2024-01-01T12:00:00.000Z'),
        level: 'info' as const,
        message: 'Application started',
      },
      {
        timestamp: new Date('2024-01-01T12:00:01.000Z'),
        level: 'warn' as const,
        message: 'Warning message',
      },
      {
        timestamp: new Date('2024-01-01T12:00:02.000Z'),
        level: 'error' as const,
        message: 'Error occurred',
      },
    ];

    vi.spyOn(useContainerLogsModule, 'useContainerLogs').mockReturnValue({
      ...defaultMockReturn,
      logs: mockLogs,
    });

    render(<ContainerLogs containerId="test-container-id" />);

    expect(screen.getByText('Application started')).toBeInTheDocument();
    expect(screen.getByText('Warning message')).toBeInTheDocument();
    expect(screen.getByText('Error occurred')).toBeInTheDocument();
  });

  it('should filter logs based on search query', () => {
    const mockLogs = [
      {
        timestamp: new Date('2024-01-01T12:00:00.000Z'),
        level: 'info' as const,
        message: 'Application started',
      },
      {
        timestamp: new Date('2024-01-01T12:00:01.000Z'),
        level: 'warn' as const,
        message: 'Warning message',
      },
      {
        timestamp: new Date('2024-01-01T12:00:02.000Z'),
        level: 'error' as const,
        message: 'Error occurred',
      },
    ];

    vi.spyOn(useContainerLogsModule, 'useContainerLogs').mockReturnValue({
      ...defaultMockReturn,
      logs: mockLogs,
    });

    render(<ContainerLogs containerId="test-container-id" />);

    const searchInput = screen.getByPlaceholderText('Search logs...');
    fireEvent.change(searchInput, { target: { value: 'warning' } });

    // Should only show the warning message
    expect(screen.getByText('Warning message')).toBeInTheDocument();
    expect(screen.queryByText('Application started')).not.toBeInTheDocument();
    expect(screen.queryByText('Error occurred')).not.toBeInTheDocument();

    // Should show filtered count
    expect(screen.getByText('Showing 1 of 3 logs')).toBeInTheDocument();
  });

  it('should clear search query when X button clicked', () => {
    const mockLogs = [
      {
        timestamp: new Date('2024-01-01T12:00:00.000Z'),
        level: 'info' as const,
        message: 'Application started',
      },
    ];

    vi.spyOn(useContainerLogsModule, 'useContainerLogs').mockReturnValue({
      ...defaultMockReturn,
      logs: mockLogs,
    });

    render(<ContainerLogs containerId="test-container-id" />);

    const searchInput = screen.getByPlaceholderText('Search logs...') as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'test' } });
    expect(searchInput.value).toBe('test');

    const clearButton = screen.getByLabelText('Clear search');
    fireEvent.click(clearButton);

    expect(searchInput.value).toBe('');
  });

  it('should show "No matches found" when search has no results', () => {
    const mockLogs = [
      {
        timestamp: new Date('2024-01-01T12:00:00.000Z'),
        level: 'info' as const,
        message: 'Application started',
      },
    ];

    vi.spyOn(useContainerLogsModule, 'useContainerLogs').mockReturnValue({
      ...defaultMockReturn,
      logs: mockLogs,
    });

    render(<ContainerLogs containerId="test-container-id" />);

    const searchInput = screen.getByPlaceholderText('Search logs...');
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

    expect(screen.getByText('No matches found')).toBeInTheDocument();
    expect(screen.getByText('Try a different search query')).toBeInTheDocument();
  });

  it('should call clearLogs when Clear button clicked and confirmed', () => {
    // Mock window.confirm to return true
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const mockLogs = [
      {
        timestamp: new Date('2024-01-01T12:00:00.000Z'),
        level: 'info' as const,
        message: 'Application started',
      },
    ];

    vi.spyOn(useContainerLogsModule, 'useContainerLogs').mockReturnValue({
      ...defaultMockReturn,
      logs: mockLogs,
    });

    render(<ContainerLogs containerId="test-container-id" />);

    const clearButton = screen.getByLabelText('Clear logs');
    fireEvent.click(clearButton);

    expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to clear all logs?');
    expect(mockClearLogs).toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('should not call clearLogs when Clear button clicked but not confirmed', () => {
    // Mock window.confirm to return false
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const mockLogs = [
      {
        timestamp: new Date('2024-01-01T12:00:00.000Z'),
        level: 'info' as const,
        message: 'Application started',
      },
    ];

    vi.spyOn(useContainerLogsModule, 'useContainerLogs').mockReturnValue({
      ...defaultMockReturn,
      logs: mockLogs,
    });

    render(<ContainerLogs containerId="test-container-id" />);

    const clearButton = screen.getByLabelText('Clear logs');
    fireEvent.click(clearButton);

    expect(confirmSpy).toHaveBeenCalled();
    expect(mockClearLogs).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('should disable Clear button when no logs', () => {
    render(<ContainerLogs containerId="test-container-id" />);

    const clearButton = screen.getByLabelText('Clear logs');
    expect(clearButton).toBeDisabled();
  });

  it('should display connection status indicators', () => {
    // Test connecting status
    vi.spyOn(useContainerLogsModule, 'useContainerLogs').mockReturnValue({
      ...defaultMockReturn,
      status: 'connecting',
    });

    const { rerender } = render(<ContainerLogs containerId="test-container-id" />);
    expect(screen.getByText('Connecting...')).toBeInTheDocument();

    // Test connected status
    vi.spyOn(useContainerLogsModule, 'useContainerLogs').mockReturnValue({
      ...defaultMockReturn,
      status: 'connected',
    });

    rerender(<ContainerLogs containerId="test-container-id" />);
    expect(screen.getByText('Live')).toBeInTheDocument();

    // Test error status
    vi.spyOn(useContainerLogsModule, 'useContainerLogs').mockReturnValue({
      ...defaultMockReturn,
      status: 'error',
    });

    rerender(<ContainerLogs containerId="test-container-id" />);
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('should display log count in footer', () => {
    const mockLogs = [
      {
        timestamp: new Date('2024-01-01T12:00:00.000Z'),
        level: 'info' as const,
        message: 'Log 1',
      },
      {
        timestamp: new Date('2024-01-01T12:00:01.000Z'),
        level: 'info' as const,
        message: 'Log 2',
      },
      {
        timestamp: new Date('2024-01-01T12:00:02.000Z'),
        level: 'info' as const,
        message: 'Log 3',
      },
    ];

    vi.spyOn(useContainerLogsModule, 'useContainerLogs').mockReturnValue({
      ...defaultMockReturn,
      logs: mockLogs,
    });

    render(<ContainerLogs containerId="test-container-id" />);

    expect(screen.getByText('3 logs')).toBeInTheDocument();
  });

  it('should use singular "log" for count of 1', () => {
    const mockLogs = [
      {
        timestamp: new Date('2024-01-01T12:00:00.000Z'),
        level: 'info' as const,
        message: 'Single log',
      },
    ];

    vi.spyOn(useContainerLogsModule, 'useContainerLogs').mockReturnValue({
      ...defaultMockReturn,
      logs: mockLogs,
    });

    render(<ContainerLogs containerId="test-container-id" />);

    expect(screen.getByText('1 log')).toBeInTheDocument();
  });

  it('should pass containerId to useContainerLogs hook', () => {
    const useContainerLogsSpy = vi.spyOn(useContainerLogsModule, 'useContainerLogs');

    render(<ContainerLogs containerId="my-test-container" />);

    expect(useContainerLogsSpy).toHaveBeenCalledWith('my-test-container');
  });
});
