/**
 * GitHubLinks component
 *
 * Displays links to GitHub issues and PRs with proper accessibility,
 * security attributes, and event handling.
 */

import { Github, GitPullRequest, ExternalLink } from 'lucide-react';

export interface GitHubLinksProps {
  issueNumber?: number;
  issueUrl?: string;
  prNumber?: number;
  prUrl?: string;
  className?: string;
}

export function GitHubLinks({
  issueNumber,
  issueUrl,
  prNumber,
  prUrl,
  className = '',
}: GitHubLinksProps) {
  // Return null if no links are provided
  if (!issueUrl && !prUrl) {
    return null;
  }

  return (
    <div className={`flex items-center gap-2 text-sm ${className}`}>
      {issueUrl && (
        <a
          href={issueUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--cyan-glow)] transition-colors"
          aria-label={`GitHub Issue #${issueNumber} (opens in new tab)`}
        >
          <Github size={14} aria-hidden="true" />
          <span>#{issueNumber}</span>
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      )}

      {prUrl && (
        <a
          href={prUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--cyan-glow)] transition-colors"
          aria-label={`GitHub Pull Request #${prNumber} (opens in new tab)`}
        >
          <GitPullRequest size={14} aria-hidden="true" />
          <span>PR #{prNumber}</span>
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
