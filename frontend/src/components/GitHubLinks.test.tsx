/**
 * GitHubLinks component tests
 *
 * Tests the GitHubLinks component's rendering, accessibility,
 * event handling, and proper link attributes.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { GitHubLinks } from './GitHubLinks';

describe('GitHubLinks', () => {
  it('should return null when no URLs provided', () => {
    const { container } = render(<GitHubLinks />);
    expect(container.firstChild).toBeNull();
  });

  it('should render issue link with correct href and aria-label', () => {
    render(
      <GitHubLinks
        issueNumber={123}
        issueUrl="https://github.com/owner/repo/issues/123"
      />
    );

    const link = screen.getByRole('link', { name: /GitHub Issue #123/i });
    expect(link).toHaveAttribute('href', 'https://github.com/owner/repo/issues/123');
    expect(link).toHaveAttribute('aria-label', 'GitHub Issue #123 (opens in new tab)');
  });

  it('should render PR link with correct href and aria-label', () => {
    render(
      <GitHubLinks
        prNumber={456}
        prUrl="https://github.com/owner/repo/pull/456"
      />
    );

    const link = screen.getByRole('link', { name: /Pull Request #456/i });
    expect(link).toHaveAttribute('href', 'https://github.com/owner/repo/pull/456');
    expect(link).toHaveAttribute('aria-label', 'GitHub Pull Request #456 (opens in new tab)');
  });

  it('should render both links when both URLs provided', () => {
    render(
      <GitHubLinks
        issueNumber={123}
        issueUrl="https://github.com/owner/repo/issues/123"
        prNumber={456}
        prUrl="https://github.com/owner/repo/pull/456"
      />
    );

    const issueLink = screen.getByRole('link', { name: /GitHub Issue #123/i });
    const prLink = screen.getByRole('link', { name: /Pull Request #456/i });
    expect(issueLink).toBeInTheDocument();
    expect(prLink).toBeInTheDocument();
  });

  it('should have rel="noopener noreferrer" on links', () => {
    render(
      <GitHubLinks
        issueNumber={123}
        issueUrl="https://github.com/owner/repo/issues/123"
        prNumber={456}
        prUrl="https://github.com/owner/repo/pull/456"
      />
    );

    const issueLink = screen.getByRole('link', { name: /GitHub Issue #123/i });
    const prLink = screen.getByRole('link', { name: /Pull Request #456/i });

    expect(issueLink).toHaveAttribute('rel', 'noopener noreferrer');
    expect(issueLink).toHaveAttribute('target', '_blank');
    expect(prLink).toHaveAttribute('rel', 'noopener noreferrer');
    expect(prLink).toHaveAttribute('target', '_blank');
  });

  it('should stop event propagation on click', () => {
    const parentClick = vi.fn();

    render(
      <div onClick={parentClick}>
        <GitHubLinks
          issueNumber={123}
          issueUrl="https://github.com/owner/repo/issues/123"
        />
      </div>
    );

    const link = screen.getByRole('link', { name: /GitHub Issue #123/i });
    fireEvent.click(link);

    // Parent onClick should not be called due to stopPropagation
    expect(parentClick).not.toHaveBeenCalled();
  });
});
