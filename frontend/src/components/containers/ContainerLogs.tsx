import { useState, useEffect, useRef } from 'react';
import { Search, X, Trash2, ArrowDown, Loader2 } from 'lucide-react';
import { useContainerLogs, type LogLevel } from '../../hooks/use-container-logs';

interface ContainerLogsProps {
  containerId: string;
}

/**
 * Get color classes for log level
 */
function getLogLevelColor(level: LogLevel): string {
  switch (level) {
    case 'error':
      return 'text-red-400';
    case 'warn':
      return 'text-yellow-400';
    case 'debug':
      return 'text-blue-400';
    case 'info':
    default:
      return 'text-[var(--text-primary)]';
  }
}

/**
 * Format timestamp for display
 */
function formatLogTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  }).format(date);
}

/**
 * ContainerLogs component displays streaming logs from a container
 *
 * Features:
 * - Real-time log streaming via SSE
 * - Auto-scroll to bottom (with toggle)
 * - Log level color coding
 * - Search/filter functionality
 * - Clear logs button
 */
export function ContainerLogs({ containerId }: ContainerLogsProps) {
  const { logs, status, clearLogs } = useContainerLogs(containerId);
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Filter logs based on search query
  const filteredLogs = searchQuery
    ? logs.filter((log) =>
        log.message.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : logs;

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogs, autoScroll]);

  // Detect manual scroll to disable auto-scroll
  useEffect(() => {
    const container = logsContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10;

      // Only update if the state would actually change
      if (isAtBottom !== autoScroll) {
        setAutoScroll(isAtBottom);
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [autoScroll]);

  const handleClearLogs = () => {
    if (confirm('Are you sure you want to clear all logs?')) {
      clearLogs();
    }
  };

  const handleScrollToBottom = () => {
    setAutoScroll(true);
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 p-4 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-2 bg-[var(--bg-primary)] border border-[var(--border)] rounded text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2">
          {status === 'connecting' && (
            <>
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
              <span className="text-xs text-[var(--text-muted)]">Connecting...</span>
            </>
          )}
          {status === 'connected' && (
            <>
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-green-400">Live</span>
            </>
          )}
          {status === 'error' && (
            <>
              <div className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-xs text-red-400">Disconnected</span>
            </>
          )}
        </div>

        {/* Clear button */}
        <button
          onClick={handleClearLogs}
          disabled={logs.length === 0}
          className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded transition-colors flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Clear logs"
        >
          <Trash2 className="w-4 h-4" />
          Clear
        </button>
      </div>

      {/* Logs container */}
      <div
        ref={logsContainerRef}
        className="flex-1 overflow-y-auto font-mono text-xs leading-relaxed p-4 bg-[var(--bg-primary)]"
      >
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
            {logs.length === 0 ? (
              <div className="text-center">
                <div className="text-sm mb-2">No logs yet</div>
                <div className="text-xs">
                  {status === 'connected'
                    ? 'Waiting for container output...'
                    : 'Start the container to see logs'}
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="text-sm mb-2">No matches found</div>
                <div className="text-xs">Try a different search query</div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {filteredLogs.map((log, index) => (
              <div key={index} className="flex gap-3 hover:bg-[var(--bg-subtle)] px-2 py-1 rounded">
                <span className="text-[var(--text-muted)] shrink-0">
                  {formatLogTimestamp(log.timestamp)}
                </span>
                <span className={`shrink-0 uppercase font-semibold w-12 ${getLogLevelColor(log.level)}`}>
                  {log.level}
                </span>
                <span className={getLogLevelColor(log.level)} style={{ wordBreak: 'break-word' }}>
                  {log.message}
                </span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      {!autoScroll && filteredLogs.length > 0 && (
        <button
          onClick={handleScrollToBottom}
          className="absolute bottom-6 right-6 p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg transition-colors"
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="w-5 h-5" />
        </button>
      )}

      {/* Footer with log count */}
      <div className="px-4 py-2 border-t border-[var(--border)] bg-[var(--bg-subtle)] text-xs text-[var(--text-muted)]">
        {searchQuery ? (
          <>
            Showing {filteredLogs.length} of {logs.length} logs
          </>
        ) : (
          <>
            {logs.length} log{logs.length !== 1 ? 's' : ''}
          </>
        )}
      </div>
    </div>
  );
}
