import { useState } from 'react';
import { Play, Square, Trash2, Circle, Activity, CheckCircle2, AlertCircle, Link as LinkIcon, Info, FileText, Terminal as TerminalIcon } from 'lucide-react';
import type { Container, ContainerStatus } from '../../types/container';
import { ContainerLogs } from './ContainerLogs';
import { ContainerTerminal } from './ContainerTerminal';

interface ContainerDetailProps {
  container: Container | null;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
}

type TabType = 'info' | 'logs' | 'terminal';

function getStatusIcon(status: ContainerStatus) {
  switch (status) {
    case 'running':
      return <Activity className="w-4 h-4 text-green-400 animate-pulse" />;
    case 'created':
      return <Circle className="w-4 h-4 text-blue-400" />;
    case 'stopped':
    case 'exited':
      return <CheckCircle2 className="w-4 h-4 text-gray-400" />;
    case 'error':
      return <AlertCircle className="w-4 h-4 text-red-400" />;
    default:
      return <Circle className="w-4 h-4 text-yellow-400" />;
  }
}

function getStatusColor(status: ContainerStatus) {
  switch (status) {
    case 'running':
      return 'bg-green-500/10 text-green-400 border-green-500/20';
    case 'created':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'stopped':
    case 'exited':
      return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    case 'error':
      return 'bg-red-500/10 text-red-400 border-red-500/20';
    default:
      return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
  }
}

function formatTimestamp(date: Date | null) {
  if (!date) return 'N/A';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function formatBytes(bytes: number | undefined) {
  if (!bytes) return 'N/A';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function ContainerDetail({
  container,
  onStart,
  onStop,
  onDelete,
}: ContainerDetailProps) {
  const [activeTab, setActiveTab] = useState<TabType>('info');

  if (!container) {
    return (
      <div className="card animate-slide-up" style={{ animationDelay: '200ms' }}>
        <div className="p-6 border-b border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Container Details
          </h2>
        </div>
        <div className="p-8 text-center text-[var(--text-muted)]">
          Select a container to view details
        </div>
      </div>
    );
  }

  const canStart = container.status === 'stopped' || container.status === 'exited' || container.status === 'created';
  const canStop = container.status === 'running';

  return (
    <div className="card animate-slide-up flex flex-col h-full" style={{ animationDelay: '200ms' }}>
      <div className="p-6 border-b border-[var(--border)]">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Container Details
        </h2>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)]">
        <button
          onClick={() => setActiveTab('info')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'info'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Info className="w-4 h-4" />
          Info
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'logs'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <FileText className="w-4 h-4" />
          Logs
        </button>
        <button
          onClick={() => setActiveTab('terminal')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'terminal'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <TerminalIcon className="w-4 h-4" />
          Terminal
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'info' && (
          <div className="p-6 space-y-6 overflow-y-auto h-full">
            {/* Name and ID */}
            <div>
              <div className="text-xs font-medium text-[var(--text-muted)] mb-2">Name</div>
              <div className="text-sm text-[var(--text-primary)] font-medium">{container.name}</div>
            </div>

            <div>
              <div className="text-xs font-medium text-[var(--text-muted)] mb-2">ID</div>
              <div className="text-sm text-[var(--text-muted)] font-mono">{container.id}</div>
            </div>

            {/* Status */}
            <div>
              <div className="text-xs font-medium text-[var(--text-muted)] mb-2">Status</div>
              <div className="flex items-center gap-2">
                {getStatusIcon(container.status)}
                <span
                  className={`px-3 py-1 text-sm font-medium border rounded ${getStatusColor(container.status)}`}
                >
                  {container.status}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {canStart && (
                <button
                  onClick={() => onStart(container.id)}
                  className="px-4 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 rounded transition-colors flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Start
                </button>
              )}
              {canStop && (
                <button
                  onClick={() => onStop(container.id)}
                  className="px-4 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/20 rounded transition-colors flex items-center gap-2"
                >
                  <Square className="w-4 h-4" />
                  Stop
                </button>
              )}
              <button
                onClick={() => onDelete(container.id)}
                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>

            {/* Image */}
            <div>
              <div className="text-xs font-medium text-[var(--text-muted)] mb-2">Image</div>
              <div className="text-sm text-[var(--text-primary)] font-mono">{container.image}</div>
            </div>

            {/* Error message */}
            {container.errorMessage && (
              <div>
                <div className="text-xs font-medium text-[var(--text-muted)] mb-2">Error</div>
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400">
                  {container.errorMessage}
                </div>
              </div>
            )}

            {/* Resource usage */}
            {container.resources && (
              <div>
                <div className="text-xs font-medium text-[var(--text-muted)] mb-2">
                  Resource Usage
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {container.resources.cpuPercent !== undefined && (
                    <div>
                      <div className="text-xs text-[var(--text-muted)]">CPU</div>
                      <div className="text-sm text-[var(--text-primary)]">
                        {container.resources.cpuPercent.toFixed(2)}%
                      </div>
                    </div>
                  )}
                  {container.resources.memoryUsage !== undefined && (
                    <div>
                      <div className="text-xs text-[var(--text-muted)]">Memory</div>
                      <div className="text-sm text-[var(--text-primary)]">
                        {formatBytes(container.resources.memoryUsage)}
                        {container.resources.memoryLimit && (
                          <span className="text-[var(--text-muted)]">
                            {' '} / {formatBytes(container.resources.memoryLimit)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {container.resources.networkRx !== undefined && (
                    <div>
                      <div className="text-xs text-[var(--text-muted)]">Network RX</div>
                      <div className="text-sm text-[var(--text-primary)]">
                        {formatBytes(container.resources.networkRx)}
                      </div>
                    </div>
                  )}
                  {container.resources.networkTx !== undefined && (
                    <div>
                      <div className="text-xs text-[var(--text-muted)]">Network TX</div>
                      <div className="text-sm text-[var(--text-primary)]">
                        {formatBytes(container.resources.networkTx)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Associated workspace and execution */}
            {(container.workspaceId || container.executionId) && (
              <div>
                <div className="text-xs font-medium text-[var(--text-muted)] mb-2">
                  Associated Resources
                </div>
                <div className="space-y-2">
                  {container.workspaceId && (
                    <div className="flex items-center gap-2 text-sm">
                      <LinkIcon className="w-3 h-3 text-[var(--text-muted)]" />
                      <span className="text-[var(--text-muted)]">Workspace:</span>
                      <span className="text-[var(--text-primary)] font-mono">
                        {container.workspaceId.slice(0, 8)}
                      </span>
                    </div>
                  )}
                  {container.executionId && (
                    <div className="flex items-center gap-2 text-sm">
                      <LinkIcon className="w-3 h-3 text-[var(--text-muted)]" />
                      <span className="text-[var(--text-muted)]">Execution:</span>
                      <span className="text-[var(--text-primary)] font-mono">
                        {container.executionId.slice(0, 8)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Configuration */}
            {container.config && (
              <div>
                <div className="text-xs font-medium text-[var(--text-muted)] mb-2">
                  Configuration
                </div>
                <div className="space-y-3">
                  {container.config.command && container.config.command.length > 0 && (
                    <div>
                      <div className="text-xs text-[var(--text-muted)] mb-1">Command</div>
                      <div className="p-2 bg-[var(--bg-subtle)] border border-[var(--border)] rounded text-sm text-[var(--text-primary)] font-mono">
                        {container.config.command.join(' ')}
                      </div>
                    </div>
                  )}
                  {container.config.workingDir && (
                    <div>
                      <div className="text-xs text-[var(--text-muted)] mb-1">Working Directory</div>
                      <div className="text-sm text-[var(--text-primary)] font-mono">
                        {container.config.workingDir}
                      </div>
                    </div>
                  )}
                  {container.config.env && Object.keys(container.config.env).length > 0 && (
                    <div>
                      <div className="text-xs text-[var(--text-muted)] mb-1">
                        Environment Variables ({Object.keys(container.config.env).length})
                      </div>
                      <div className="max-h-[200px] overflow-y-auto space-y-1">
                        {Object.entries(container.config.env).map(([key, value]) => (
                          <div
                            key={key}
                            className="p-2 bg-[var(--bg-subtle)] border border-[var(--border)] rounded text-xs text-[var(--text-primary)] font-mono"
                          >
                            {key}={value}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {container.config.volumes && Object.keys(container.config.volumes).length > 0 && (
                    <div>
                      <div className="text-xs text-[var(--text-muted)] mb-1">
                        Volumes ({Object.keys(container.config.volumes).length})
                      </div>
                      <div className="space-y-1">
                        {Object.entries(container.config.volumes).map(([host, containerPath]) => (
                          <div
                            key={host}
                            className="p-2 bg-[var(--bg-subtle)] border border-[var(--border)] rounded text-xs text-[var(--text-primary)] font-mono"
                          >
                            {host} : {containerPath}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {container.config.ports && Object.keys(container.config.ports).length > 0 && (
                    <div>
                      <div className="text-xs text-[var(--text-muted)] mb-1">
                        Port Mappings ({Object.keys(container.config.ports).length})
                      </div>
                      <div className="space-y-1">
                        {Object.entries(container.config.ports).map(([containerPort, hostPort]) => (
                          <div
                            key={containerPort}
                            className="p-2 bg-[var(--bg-subtle)] border border-[var(--border)] rounded text-xs text-[var(--text-primary)] font-mono"
                          >
                            {containerPort} : {hostPort}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div>
              <div className="text-xs font-medium text-[var(--text-muted)] mb-2">Timestamps</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Created:</span>
                  <span className="text-[var(--text-primary)]">{formatTimestamp(container.createdAt)}</span>
                </div>
                {container.startedAt && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Started:</span>
                    <span className="text-[var(--text-primary)]">{formatTimestamp(container.startedAt)}</span>
                  </div>
                )}
                {container.stoppedAt && (
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Stopped:</span>
                    <span className="text-[var(--text-primary)]">{formatTimestamp(container.stoppedAt)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[var(--text-muted)]">Updated:</span>
                  <span className="text-[var(--text-primary)]">{formatTimestamp(container.updatedAt)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <ContainerLogs containerId={container.id} />
        )}

        {/* Only render terminal when tab is active to avoid unnecessary connections */}
        {activeTab === 'terminal' && (
          <ContainerTerminal containerId={container.id} />
        )}
      </div>
    </div>
  );
}
