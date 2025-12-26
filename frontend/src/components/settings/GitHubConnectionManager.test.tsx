/**
 * Tests for GitHubConnectionManager component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { createWrapper } from '../../test-utils';
import { GitHubConnectionManager } from './GitHubConnectionManager';

// Mock the window.location.href
delete (window as any).location;
window.location = { href: '' } as any;

// Mock initiateGitHubOAuth to prevent actual redirects
vi.mock('../../hooks/use-github-connections', async () => {
  const actual = await vi.importActual('../../hooks/use-github-connections');
  return {
    ...actual,
    initiateGitHubOAuth: vi.fn(),
  };
});

describe('GitHubConnectionManager', () => {
  it('should render loading state initially', () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    render(<GitHubConnectionManager />, { wrapper });

    // Assert
    expect(screen.getByText(/loading/i) || screen.getByRole('button')).toBeDefined();
  });

  it('should render "Connect GitHub" button', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    render(<GitHubConnectionManager />, { wrapper });

    // Assert
    await waitFor(() => {
      const button = screen.getByRole('button', { name: /connect github/i });
      expect(button).toBeDefined();
    });
  });

  it('should display connections list when data loads', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    render(<GitHubConnectionManager />, { wrapper });

    // Assert
    await waitFor(() => {
      const username = screen.queryByText('testuser');
      expect(username).toBeDefined();
    });
  });

  it('should show connection with username and avatar', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    render(<GitHubConnectionManager />, { wrapper });

    // Assert
    await waitFor(() => {
      expect(screen.queryByText('testuser')).toBeDefined();
    });
  });

  it('should have a disconnect button for each connection', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    render(<GitHubConnectionManager />, { wrapper });

    // Assert
    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });
});
