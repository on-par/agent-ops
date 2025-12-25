import { Play, Square, Trash2, Circle, Activity, CheckCircle2, AlertCircle } from 'lucide-react';
import type { ContainerListItem, ContainerStatus } from '../../types/container';

interface ContainerCardProps {
  container: ContainerListItem;
  selected?: boolean;
  onSelect: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
}

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
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function ContainerCard({
  container,
  selected = false,
  onSelect,
  onStart,
  onStop,
  onDelete,
}: ContainerCardProps) {
  const canStart = container.status === 'stopped' || container.status === 'exited' || container.status === 'created';
  const canStop = container.status === 'running';

  const handleAction = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  return (
    <button
      onClick={() => onSelect(container.id)}
      className={`w-full p-4 text-left hover:bg-[var(--bg-hover)] transition-colors border-b border-[var(--border)] ${
        selected ? 'bg-[var(--bg-hover)]' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            {getStatusIcon(container.status)}
            <span
              className={`px-2 py-0.5 text-xs font-medium border rounded ${getStatusColor(container.status)}`}
            >
              {container.status}
            </span>
          </div>
          <div className="font-medium text-[var(--text-primary)] mb-1 truncate">
            {container.name}
          </div>
          <div className="text-sm text-[var(--text-muted)] space-y-1">
            <div className="truncate">Image: {container.image}</div>
            {container.workspaceId && (
              <div className="truncate text-xs">
                Workspace: {container.workspaceId.slice(0, 8)}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-xs text-[var(--text-muted)]">
            {formatTimestamp(container.createdAt)}
          </div>
          <div className="flex items-center gap-1">
            {canStart && (
              <button
                onClick={(e) => handleAction(e, () => onStart(container.id))}
                className="p-1.5 hover:bg-green-500/10 rounded transition-colors"
                title="Start container"
              >
                <Play className="w-4 h-4 text-green-400" />
              </button>
            )}
            {canStop && (
              <button
                onClick={(e) => handleAction(e, () => onStop(container.id))}
                className="p-1.5 hover:bg-yellow-500/10 rounded transition-colors"
                title="Stop container"
              >
                <Square className="w-4 h-4 text-yellow-400" />
              </button>
            )}
            <button
              onClick={(e) => handleAction(e, () => onDelete(container.id))}
              className="p-1.5 hover:bg-red-500/10 rounded transition-colors"
              title="Delete container"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
            </button>
          </div>
        </div>
      </div>
      {container.errorMessage && (
        <div className="mt-2 text-xs text-red-400 truncate">
          Error: {container.errorMessage}
        </div>
      )}
    </button>
  );
}
