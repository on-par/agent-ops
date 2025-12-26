import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Github, Plus, Trash2 } from 'lucide-react';
import {
  useGitHubConnections,
  useDeleteGitHubConnection,
  initiateGitHubOAuth,
} from '../../hooks/use-github-connections';

export function GitHubConnectionManager() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { data: connections, isLoading } = useGitHubConnections();
  const deleteMutation = useDeleteGitHubConnection();

  // Handle OAuth callback
  useEffect(() => {
    const connectionId = searchParams.get('connection_id');
    if (connectionId) {
      setSuccessMessage('GitHub connected successfully!');
      setSearchParams({});
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  }, [searchParams, setSearchParams]);

  const handleConnect = () => {
    initiateGitHubOAuth();
  };

  const handleDisconnect = async (connectionId: string, username: string) => {
    if (confirm(`Disconnect GitHub account @${username}? This will remove all connected repositories.`)) {
      deleteMutation.mutate(connectionId);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">GitHub Connections</h3>
            <p className="text-sm text-[var(--text-muted)]">Connect your GitHub account to sync repositories</p>
          </div>
          <button
            disabled
            className="px-4 py-2.5 rounded-lg bg-[var(--cyan-glow)]/20 text-[var(--cyan-glow)] font-medium flex items-center gap-2 opacity-50 cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
            Loading...
          </button>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-[var(--bg-elevated)] rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {successMessage && (
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-sm text-green-400">
          {successMessage}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">GitHub Connections</h3>
          <p className="text-sm text-[var(--text-muted)]">Connect your GitHub account to sync repositories</p>
        </div>
        <button
          onClick={handleConnect}
          className="px-4 py-2.5 rounded-lg bg-[var(--cyan-glow)]/20 text-[var(--cyan-glow)] hover:bg-[var(--cyan-glow)]/30 font-medium flex items-center gap-2 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Connect GitHub
        </button>
      </div>

      {connections && connections.length > 0 ? (
        <div className="space-y-2">
          {connections.map((connection) => (
            <div
              key={connection.id}
              className="flex items-center justify-between p-4 bg-[var(--bg-elevated)] rounded-lg border border-white/[0.06] hover:border-white/[0.12] transition-colors"
            >
              <div className="flex items-center gap-3 flex-1">
                {connection.avatarUrl ? (
                  <img
                    src={connection.avatarUrl}
                    alt={connection.username}
                    className="w-10 h-10 rounded-full"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[var(--bg-card)] flex items-center justify-center">
                    <Github className="h-5 w-5 text-[var(--text-muted)]" />
                  </div>
                )}
                <div>
                  <p className="font-medium text-[var(--text-primary)]">{connection.username}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Connected {new Date(connection.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleDisconnect(connection.id, connection.username)}
                disabled={deleteMutation.isPending}
                className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-[var(--text-muted)] hover:text-[var(--rose)] disabled:opacity-50 disabled:cursor-not-allowed"
                title="Disconnect"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-6 text-center border border-white/[0.06] rounded-lg bg-[var(--bg-card)]/50">
          <Github className="h-12 w-12 mx-auto mb-4 text-[var(--text-muted)]" />
          <p className="text-[var(--text-muted)] mb-4">No GitHub connections yet. Connect your account to get started.</p>
          <button
            onClick={handleConnect}
            className="px-4 py-2.5 rounded-lg bg-[var(--cyan-glow)]/20 text-[var(--cyan-glow)] hover:bg-[var(--cyan-glow)]/30 font-medium flex items-center gap-2 mx-auto transition-colors"
          >
            <Github className="h-4 w-4" />
            Connect GitHub
          </button>
        </div>
      )}
    </div>
  );
}
