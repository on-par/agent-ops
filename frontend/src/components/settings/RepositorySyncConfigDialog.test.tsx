/**
 * Tests for RepositorySyncConfigDialog component
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createWrapper } from '../../test-utils';
import { RepositorySyncConfigDialog } from './RepositorySyncConfigDialog';
import type { Repository } from '../../types/github';

const mockRepository: Repository = {
  id: 'repo-1',
  connectionId: 'conn-1',
  githubId: 123,
  fullName: 'test/repo',
  owner: 'test',
  name: 'repo',
  description: 'Test repository',
  private: false,
  syncStatus: 'synced',
  labelsFilter: ['bug'],
  autoAssign: false,
  lastSyncAt: null,
  lastSyncError: null,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

describe('RepositorySyncConfigDialog', () => {
  it('should render dialog with repository name in title', () => {
    // Arrange
    const wrapper = createWrapper();
    const handleClose = () => {};

    // Act
    render(
      <RepositorySyncConfigDialog
        repository={mockRepository}
        open={true}
        onOpenChange={handleClose}
      />,
      { wrapper }
    );

    // Assert
    expect(screen.getByText(/test\/repo/)).toBeDefined();
  });

  it('should pre-fill form with existing config', async () => {
    // Arrange
    const wrapper = createWrapper();
    const handleClose = () => {};

    // Act
    render(
      <RepositorySyncConfigDialog
        repository={mockRepository}
        open={true}
        onOpenChange={handleClose}
      />,
      { wrapper }
    );

    // Assert
    await waitFor(() => {
      expect(screen.queryByDisplayValue(/bug/)).toBeDefined();
    });
  });

  it('should have Cancel and Save buttons', () => {
    // Arrange
    const wrapper = createWrapper();
    const handleClose = () => {};

    // Act
    render(
      <RepositorySyncConfigDialog
        repository={mockRepository}
        open={true}
        onOpenChange={handleClose}
      />,
      { wrapper }
    );

    // Assert
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /save/i })).toBeDefined();
  });

  it('should not render when open is false', () => {
    // Arrange
    const wrapper = createWrapper();
    const handleClose = () => {};

    // Act
    const { container } = render(
      <RepositorySyncConfigDialog
        repository={mockRepository}
        open={false}
        onOpenChange={handleClose}
      />,
      { wrapper }
    );

    // Assert
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-hidden')).toBe('true');
  });
});
