import { useState } from 'react';
import { RefreshCw, Settings, Trash2, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import {
  useRepositories,
  useDisconnectRepository,
  useSyncRepository,
} from '../../hooks/use-repositories';
import { RepositorySyncConfigDialog } from './RepositorySyncConfigDialog';
import type { Repository, SyncStatus } from '../../types/github';

function SyncStatusBadge({ status }: { status: SyncStatus }) {
  const config = {
    pending: { icon: Clock, color: 'text-yellow-500', label: 'Pending' },
    syncing: { icon: RefreshCw, color: 'text-blue-500', label: 'Syncing', spin: true },
    synced: { icon: CheckCircle, color: 'text-green-500', label: 'Synced' },
    error: { icon: AlertCircle, color: 'text-red-500', label: 'Error' },
  };

  const { icon: Icon, color, label, spin } = config[status];

  return (
    <div className={`flex items-center gap-1 ${color}`}>
      <Icon className={`h-4 w-4 ${spin ? 'animate-spin' : ''}`} />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ConnectedRepositoryList() {
  const { data: repositories, isLoading } = useRepositories();
  const disconnectMutation = useDisconnectRepository();
  const syncMutation = useSyncRepository();
  const [editingRepo, setEditingRepo] = useState<Repository | null>(null);

  const handleDisconnect = async (repo: Repository) => {
    if (confirm(`Disconnect ${repo.fullName}? Issues will no longer sync.`)) {
      disconnectMutation.mutate(repo.id);
    }
  };

  const handleSync = (repoId: string) => {
    syncMutation.mutate(repoId);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h4 className="font-semibold text-[var(--text-primary)]">Connected Repositories</h4>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-[var(--bg-elevated)] rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!repositories || repositories.length === 0) {
    return (
      <div className="space-y-4">
        <h4 className="font-semibold text-[var(--text-primary)]">Connected Repositories</h4>
        <div className="p-6 text-center border border-white/[0.06] rounded-lg bg-[var(--bg-card)]/50">
          <p className="text-[var(--text-muted)]">
            No connected repositories. Connect your GitHub account and select repositories to sync.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <h4 className="font-semibold text-[var(--text-primary)]">Connected Repositories</h4>
        <div className="space-y-2">
          {repositories.map((repo) => (
            <div
              key={repo.id}
              className="p-4 bg-[var(--bg-elevated)] rounded-lg border border-white/[0.06] hover:border-white/[0.12] transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h5 className="font-medium text-[var(--text-primary)] truncate">{repo.fullName}</h5>
                    {repo.private && (
                      <span className="px-2 py-1 text-xs bg-[var(--bg-card)] text-[var(--text-muted)] rounded-full whitespace-nowrap">
                        Private
                      </span>
                    )}
                    <SyncStatusBadge status={repo.syncStatus} />
                  </div>
                  {repo.description && (
                    <p className="text-sm text-[var(--text-muted)] mb-2 line-clamp-2">{repo.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-[var(--text-muted)] flex-wrap">
                    {repo.lastSyncAt && (
                      <span>Last sync: {new Date(repo.lastSyncAt).toLocaleString()}</span>
                    )}
                    {repo.autoAssign && <span>Auto-assign enabled</span>}
                    {repo.labelsFilter && repo.labelsFilter.length > 0 && (
                      <span>Filtering {repo.labelsFilter.length} labels</span>
                    )}
                  </div>
                  {repo.lastSyncError && (
                    <p className="text-xs text-red-500 mt-2">{repo.lastSyncError}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleSync(repo.id)}
                    disabled={syncMutation.isPending || repo.syncStatus === 'syncing'}
                    title="Sync repository"
                    className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-[var(--text-muted)] hover:text-[var(--cyan-glow)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${repo.syncStatus === 'syncing' ? 'animate-spin' : ''}`}
                    />
                  </button>
                  <button
                    onClick={() => setEditingRepo(repo)}
                    title="Configure sync settings"
                    className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-[var(--text-muted)] hover:text-[var(--cyan-glow)]"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDisconnect(repo)}
                    disabled={disconnectMutation.isPending}
                    title="Disconnect repository"
                    className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-[var(--text-muted)] hover:text-[var(--rose)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingRepo && (
        <RepositorySyncConfigDialog
          repository={editingRepo}
          open={!!editingRepo}
          onOpenChange={(open) => !open && setEditingRepo(null)}
        />
      )}
    </>
  );
}
