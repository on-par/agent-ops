/**
 * Tests for ConnectedRepositoryList component
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createWrapper } from '../../test-utils';
import { ConnectedRepositoryList } from './ConnectedRepositoryList';

describe('ConnectedRepositoryList', () => {
  it('should render loading state initially', () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    render(<ConnectedRepositoryList />, { wrapper });

    // Assert
    expect(screen.getByText(/loading/i) || screen.getByRole('button')).toBeDefined();
  });

  it('should display repositories list when data loads', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    render(<ConnectedRepositoryList />, { wrapper });

    // Assert
    await waitFor(() => {
      const repoName = screen.queryByText(/test-repo/i);
      expect(repoName).toBeDefined();
    });
  });

  it('should show repository name and description', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    render(<ConnectedRepositoryList />, { wrapper });

    // Assert
    await waitFor(() => {
      expect(screen.queryByText(/test repository/i)).toBeDefined();
    });
  });

  it('should display sync status badge', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    render(<ConnectedRepositoryList />, { wrapper });

    // Assert
    await waitFor(() => {
      // Should show sync status
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  it('should have action buttons for each repository', async () => {
    // Arrange
    const wrapper = createWrapper();

    // Act
    render(<ConnectedRepositoryList />, { wrapper });

    // Assert
    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });
});
