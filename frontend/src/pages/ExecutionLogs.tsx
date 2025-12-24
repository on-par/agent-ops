import { useState } from 'react';
import { ScrollText, Clock, Activity, AlertCircle, CheckCircle2, Circle } from 'lucide-react';
import { useExecutions, useExecution } from '../hooks/use-executions';
import type { ExecutionStatus } from '../types/execution';

const STATUS_FILTERS: Array<{ label: string; value: ExecutionStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Running', value: 'running' },
  { label: 'Success', value: 'success' },
  { label: 'Error', value: 'error' },
];

function getStatusIcon(status: ExecutionStatus) {
  switch (status) {
    case 'running':
      return <Activity className="w-4 h-4 text-blue-400 animate-pulse" />;
    case 'success':
      return <CheckCircle2 className="w-4 h-4 text-green-400" />;
    case 'error':
      return <AlertCircle className="w-4 h-4 text-red-400" />;
    case 'cancelled':
      return <Circle className="w-4 h-4 text-gray-400" />;
    default:
      return <Clock className="w-4 h-4 text-yellow-400" />;
  }
}

function getStatusColor(status: ExecutionStatus) {
  switch (status) {
    case 'running':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'success':
      return 'bg-green-500/10 text-green-400 border-green-500/20';
    case 'error':
      return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'cancelled':
      return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    default:
      return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
  }
}

function formatDuration(ms: number | null) {
  if (!ms) return 'N/A';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatTimestamp(date: Date | null) {
  if (!date) return 'N/A';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function ExecutionLogs() {
  const [activeFilter, setActiveFilter] = useState<ExecutionStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Fetch executions with optional status filter
  const { data: executionsData, isLoading } = useExecutions(
    activeFilter === 'all' ? {} : { status: activeFilter }
  );

  // Fetch selected execution details
  const { data: selectedExecution } = useExecution(selectedId || '');

  const executions = executionsData?.items || [];

  return (
    <div className="min-h-screen bg-[var(--bg-deep)] relative">
      {/* Grid background */}
      <div className="grid-bg" />

      <div className="relative z-10 p-6 lg:p-8 max-w-[1800px] mx-auto">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 animate-fade-in">
          <h1 className="text-[28px] font-semibold text-[var(--text-primary)] flex items-center gap-3 tracking-tight">
            <ScrollText className="w-8 h-8 text-[var(--cyan-glow)]" />
            Execution Logs
          </h1>
        </header>

        {/* Status filter tabs */}
        <div className="mb-6 animate-slide-up">
          <div className="tab-container inline-flex gap-1">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setActiveFilter(filter.value)}
                className={`tab-item ${activeFilter === filter.value ? 'active' : ''}`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Execution list */}
          <div className="card animate-slide-up" style={{ animationDelay: '100ms' }}>
            <div className="p-6 border-b border-[var(--border)]">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Executions
                {executionsData && (
                  <span className="ml-2 text-sm font-normal text-[var(--text-muted)]">
                    ({executionsData.total})
                  </span>
                )}
              </h2>
            </div>

            <div className="divide-y divide-[var(--border)] max-h-[600px] overflow-y-auto">
              {isLoading ? (
                <div className="p-8 text-center text-[var(--text-muted)]">Loading...</div>
              ) : executions.length === 0 ? (
                <div className="p-8 text-center text-[var(--text-muted)]">
                  No executions found
                </div>
              ) : (
                executions.map((execution) => (
                  <button
                    key={execution.id}
                    onClick={() => setSelectedId(execution.id)}
                    className={`w-full p-4 text-left hover:bg-[var(--bg-hover)] transition-colors ${
                      selectedId === execution.id ? 'bg-[var(--bg-hover)]' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          {getStatusIcon(execution.status)}
                          <span
                            className={`px-2 py-0.5 text-xs font-medium border rounded ${getStatusColor(execution.status)}`}
                          >
                            {execution.status}
                          </span>
                        </div>
                        <div className="text-sm text-[var(--text-muted)] space-y-1">
                          {execution.workerId && (
                            <div className="truncate">Worker: {execution.workerId.slice(0, 8)}</div>
                          )}
                          {execution.workItemId && (
                            <div className="truncate">
                              Work Item: {execution.workItemId.slice(0, 8)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-xs text-[var(--text-muted)] space-y-1">
                        <div>{formatTimestamp(execution.createdAt)}</div>
                        {execution.durationMs && (
                          <div className="font-medium">{formatDuration(execution.durationMs)}</div>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Execution detail */}
          <div className="card animate-slide-up" style={{ animationDelay: '200ms' }}>
            <div className="p-6 border-b border-[var(--border)]">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Execution Details
              </h2>
            </div>

            {!selectedExecution ? (
              <div className="p-8 text-center text-[var(--text-muted)]">
                Select an execution to view details
              </div>
            ) : (
              <div className="p-6 space-y-6">
                {/* Status */}
                <div>
                  <div className="text-xs font-medium text-[var(--text-muted)] mb-2">Status</div>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(selectedExecution.status)}
                    <span
                      className={`px-3 py-1 text-sm font-medium border rounded ${getStatusColor(selectedExecution.status)}`}
                    >
                      {selectedExecution.status}
                    </span>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-medium text-[var(--text-muted)] mb-1">
                      Duration
                    </div>
                    <div className="text-sm text-[var(--text-primary)]">
                      {formatDuration(selectedExecution.durationMs)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-[var(--text-muted)] mb-1">Tokens</div>
                    <div className="text-sm text-[var(--text-primary)]">
                      {selectedExecution.tokensUsed.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Error message */}
                {selectedExecution.errorMessage && (
                  <div>
                    <div className="text-xs font-medium text-[var(--text-muted)] mb-2">Error</div>
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400">
                      {selectedExecution.errorMessage}
                    </div>
                  </div>
                )}

                {/* Output summary */}
                {selectedExecution.output?.summary && (
                  <div>
                    <div className="text-xs font-medium text-[var(--text-muted)] mb-2">
                      Summary
                    </div>
                    <div className="text-sm text-[var(--text-primary)]">
                      {selectedExecution.output.summary}
                    </div>
                  </div>
                )}

                {/* Files changed */}
                {selectedExecution.output?.filesChanged &&
                  selectedExecution.output.filesChanged.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-[var(--text-muted)] mb-2">
                        Files Changed ({selectedExecution.output.filesChanged.length})
                      </div>
                      <div className="space-y-1 max-h-[200px] overflow-y-auto">
                        {selectedExecution.output.filesChanged.map((file, i) => (
                          <div key={i} className="text-sm text-[var(--text-muted)] font-mono">
                            {file}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Traces */}
                {selectedExecution.traces && selectedExecution.traces.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-[var(--text-muted)] mb-2">
                      Traces ({selectedExecution.traces.length})
                    </div>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {selectedExecution.traces.map((trace) => (
                        <div
                          key={trace.id}
                          className="p-3 bg-[var(--bg-subtle)] border border-[var(--border)] rounded"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-[var(--text-primary)]">
                              {trace.eventType}
                            </span>
                            <span className="text-xs text-[var(--text-muted)]">
                              {formatTimestamp(trace.timestamp)}
                            </span>
                          </div>
                          <pre className="text-xs text-[var(--text-muted)] overflow-x-auto">
                            {JSON.stringify(trace.data, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
