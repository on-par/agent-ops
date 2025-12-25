import type { ContainerListItem } from '../../types/container';
import { ContainerCard } from './ContainerCard';

interface ContainerListProps {
  containers: ContainerListItem[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
  total?: number;
}

function LoadingSkeleton() {
  return (
    <div className="p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 bg-[var(--bg-subtle)] rounded" />
        <div className="w-20 h-5 bg-[var(--bg-subtle)] rounded" />
      </div>
      <div className="w-3/4 h-4 bg-[var(--bg-subtle)] rounded" />
      <div className="w-1/2 h-3 bg-[var(--bg-subtle)] rounded" />
    </div>
  );
}

export function ContainerList({
  containers,
  isLoading,
  selectedId,
  onSelect,
  onStart,
  onStop,
  onDelete,
  total,
}: ContainerListProps) {
  return (
    <div className="card animate-slide-up" style={{ animationDelay: '100ms' }}>
      <div className="p-6 border-b border-[var(--border)]">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Containers
          {total !== undefined && (
            <span className="ml-2 text-sm font-normal text-[var(--text-muted)]">
              ({total})
            </span>
          )}
        </h2>
      </div>

      <div className="max-h-[600px] overflow-y-auto">
        {isLoading ? (
          <>
            <LoadingSkeleton />
            <LoadingSkeleton />
            <LoadingSkeleton />
          </>
        ) : containers.length === 0 ? (
          <div className="p-8 text-center text-[var(--text-muted)]">
            No containers found
          </div>
        ) : (
          containers.map((container) => (
            <ContainerCard
              key={container.id}
              container={container}
              selected={selectedId === container.id}
              onSelect={onSelect}
              onStart={onStart}
              onStop={onStop}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}
