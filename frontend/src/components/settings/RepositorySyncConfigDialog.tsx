import { useState } from 'react';
import { X } from 'lucide-react';
import { useUpdateRepository } from '../../hooks/use-repositories';
import type { Repository, RepositoryUpdateInput } from '../../types/github';

interface RepositorySyncConfigDialogProps {
  repository: Repository;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RepositorySyncConfigDialog({
  repository,
  open,
  onOpenChange,
}: RepositorySyncConfigDialogProps) {
  const updateMutation = useUpdateRepository();
  const [labelsFilter, setLabelsFilter] = useState(repository.labelsFilter?.join(', ') || '');
  const [autoAssign, setAutoAssign] = useState(repository.autoAssign || false);

  const handleSubmit = () => {
    const labels = labelsFilter
      ? labelsFilter.split(',').map((l) => l.trim()).filter(Boolean)
      : undefined;

    const updateData: RepositoryUpdateInput = {
      labelsFilter: labels,
      autoAssign,
    };

    updateMutation.mutate(
      { id: repository.id, data: updateData },
      {
        onSuccess: () => {
          handleClose();
        },
      }
    );
  };

  const handleClose = () => {
    setLabelsFilter(repository.labelsFilter?.join(', ') || '');
    setAutoAssign(repository.autoAssign || false);
    onOpenChange(false);
  };

  if (!open) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={handleClose}
        role="presentation"
      />

      {/* Dialog */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div className="w-full max-w-md bg-[var(--bg-card)] rounded-2xl border border-white/[0.04] shadow-xl overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/[0.04]">
            <div>
              <h2
                id="dialog-title"
                className="text-lg font-semibold text-[var(--text-primary)]"
              >
                Sync Configuration
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-1">{repository.fullName}</p>
            </div>
            <button
              onClick={handleClose}
              className="p-1 hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              title="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-5">
            {/* Labels Filter */}
            <div>
              <label htmlFor="labels" className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                Labels Filter
              </label>
              <p className="text-xs text-[var(--text-muted)] mb-3">
                Only sync issues with these labels (comma-separated, leave empty for all)
              </p>
              <input
                id="labels"
                placeholder="bug, enhancement"
                type="text"
                value={labelsFilter}
                onChange={(e) => setLabelsFilter(e.target.value)}
                className="w-full px-4 py-2.5 bg-[var(--bg-elevated)] border border-white/[0.06] rounded-xl
                           text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]
                           focus:outline-none focus:border-[var(--cyan-glow)]/30 focus:ring-1 focus:ring-[var(--cyan-glow)]/20
                           transition-all"
              />
            </div>

            {/* Auto-Assign Toggle */}
            <div className="flex items-start justify-between">
              <div>
                <label htmlFor="autoAssign" className="block text-sm font-medium text-[var(--text-primary)]">
                  Auto-Assign Issues
                </label>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Automatically assign synced issues to you
                </p>
              </div>
              <input
                id="autoAssign"
                type="checkbox"
                checked={autoAssign}
                onChange={(e) => setAutoAssign(e.target.checked)}
                className="w-5 h-5 rounded accent-[var(--cyan-glow)] cursor-pointer mt-1"
              />
            </div>

            {/* Sync Triggers Info */}
            <div className="p-4 bg-[var(--bg-elevated)] rounded-lg border border-white/[0.06]">
              <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">Sync Triggers</h4>
              <p className="text-xs text-[var(--text-muted)] mb-2">
                Automatic sync via webhooks (configured on backend)
              </p>
              <ul className="text-xs text-[var(--text-muted)] space-y-1 list-disc list-inside">
                <li>New issues created</li>
                <li>Issue updates and comments</li>
                <li>Manual sync available</li>
              </ul>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-white/[0.04] bg-[var(--bg-elevated)]/50">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2.5 rounded-lg bg-[var(--bg-card)] border border-white/[0.06] text-[var(--text-primary)]
                         hover:bg-[var(--bg-hover)] hover:border-white/[0.12] transition-all text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={updateMutation.isPending}
              className="px-4 py-2.5 rounded-lg bg-[var(--cyan-glow)]/20 text-[var(--cyan-glow)]
                         hover:bg-[var(--cyan-glow)]/30 transition-all text-sm font-medium
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
