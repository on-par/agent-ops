import { useState, useEffect } from "react";
import { Trash2, Save, TestTube } from "lucide-react";
import {
  useCreateProviderSettings,
  useUpdateProviderSettings,
  useDeleteProviderSettings,
  useTestConnection,
  useSetDefaultProviderSettings,
} from "../../hooks/use-provider-settings";
import type {
  ProviderType,
  ProviderSettings as ProviderSettingsType,
  ConnectionStatus as ConnectionStatusType,
  ConnectionTestResult,
} from "../../types/llm-provider";
import { ConnectionStatus } from "./ConnectionStatus";
import { ModelSelector } from "./ModelSelector";

interface ProviderSettingsProps {
  existingSettings?: ProviderSettingsType;
  onSave?: () => void;
  onDelete?: () => void;
}

const PROVIDER_OPTIONS: { value: ProviderType; label: string }[] = [
  { value: "ollama", label: "Ollama" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
];

const DEFAULT_BASE_URLS: Record<ProviderType, string | null> = {
  ollama: "http://localhost:11434",
  openai: null,
  anthropic: null,
  openrouter: null,
};

export function ProviderSettings({
  existingSettings,
  onSave,
  onDelete,
}: ProviderSettingsProps) {
  const [providerType, setProviderType] = useState<ProviderType>(
    existingSettings?.providerType || "ollama"
  );
  const [baseUrl, setBaseUrl] = useState(
    existingSettings?.baseUrl || DEFAULT_BASE_URLS.ollama || ""
  );
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState(
    existingSettings?.model || ""
  );
  const [isDefault, setIsDefault] = useState(
    existingSettings?.isDefault || false
  );
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatusType>("idle");
  const [connectionResult, setConnectionResult] =
    useState<ConnectionTestResult | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createMutation = useCreateProviderSettings();
  const updateMutation = useUpdateProviderSettings();
  const deleteMutation = useDeleteProviderSettings();
  const testConnectionMutation = useTestConnection();
  const setDefaultMutation = useSetDefaultProviderSettings();

  // Reset form when provider type changes
  useEffect(() => {
    if (!existingSettings) {
      setBaseUrl(DEFAULT_BASE_URLS[providerType] || "");
      setApiKey("");
      setSelectedModel("");
      setConnectionStatus("idle");
      setConnectionResult(null);
      setErrors({});
    }
  }, [providerType, existingSettings]);

  const requiresApiKey = (provider: ProviderType) => {
    return provider === "openai" || provider === "anthropic" || provider === "openrouter";
  };

  const requiresBaseUrl = (provider: ProviderType) => {
    return provider === "ollama";
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!providerType) {
      newErrors.providerType = "Provider type is required";
    }

    if (requiresBaseUrl(providerType) && !baseUrl) {
      newErrors.baseUrl = "Base URL is required for Ollama";
    }

    if (requiresApiKey(providerType) && !apiKey && !existingSettings) {
      newErrors.apiKey = "API key is required for this provider";
    }

    if (!selectedModel) {
      newErrors.model = "Model selection is required";
    }

    if (connectionStatus !== "connected") {
      newErrors.connection = "Please test the connection before saving";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleTestConnection = async () => {
    setConnectionStatus("testing");
    setConnectionResult(null);
    setErrors((prev) => ({ ...prev, connection: "" }));

    try {
      const result = await testConnectionMutation.mutateAsync({
        providerType,
        baseUrl: requiresBaseUrl(providerType) ? baseUrl : undefined,
        apiKey: requiresApiKey(providerType) ? apiKey : undefined,
      });

      setConnectionResult(result);
      setConnectionStatus(result.success ? "connected" : "error");
    } catch (error) {
      setConnectionStatus("error");
      setConnectionResult({
        success: false,
        error: error instanceof Error ? error.message : "Connection test failed",
      });
    }
  };

  const handleSave = async () => {
    if (!validate()) {
      return;
    }

    try {
      const input = {
        providerType,
        baseUrl: requiresBaseUrl(providerType) ? baseUrl : undefined,
        apiKey: requiresApiKey(providerType) && apiKey ? apiKey : undefined,
        model: selectedModel,
        isDefault,
      };

      if (existingSettings) {
        await updateMutation.mutateAsync({
          id: existingSettings.id,
          input,
        });
      } else {
        await createMutation.mutateAsync(input);
      }

      onSave?.();
    } catch (error) {
      setErrors({
        submit: error instanceof Error ? error.message : "Failed to save settings",
      });
    }
  };

  const handleDelete = async () => {
    if (!existingSettings) return;

    try {
      await deleteMutation.mutateAsync(existingSettings.id);
      onDelete?.();
    } catch (error) {
      setErrors({
        submit: error instanceof Error ? error.message : "Failed to delete settings",
      });
    }
  };

  const handleSetDefault = async () => {
    if (!existingSettings) return;

    try {
      await setDefaultMutation.mutateAsync(existingSettings.id);
      setIsDefault(true);
    } catch (error) {
      setErrors({
        submit: error instanceof Error ? error.message : "Failed to set as default",
      });
    }
  };

  const canSave =
    selectedModel &&
    connectionStatus === "connected" &&
    !createMutation.isPending &&
    !updateMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Provider Type Selection */}
      <div>
        <label className="block text-sm text-[var(--text-muted)] mb-2">
          Provider Type
        </label>
        <select
          value={providerType}
          onChange={(e) => setProviderType(e.target.value as ProviderType)}
          disabled={!!existingSettings}
          className="w-full px-4 py-2.5 bg-[var(--bg-elevated)] border border-white/[0.06] rounded-xl
                     text-sm text-[var(--text-primary)]
                     focus:outline-none focus:border-[var(--cyan-glow)]/30 focus:ring-1 focus:ring-[var(--cyan-glow)]/20
                     transition-all
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {PROVIDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {errors.providerType && (
          <p className="text-xs text-[var(--rose)] mt-1">{errors.providerType}</p>
        )}
      </div>

      {/* Base URL (for Ollama) */}
      {requiresBaseUrl(providerType) && (
        <div>
          <label className="block text-sm text-[var(--text-muted)] mb-2">
            Base URL
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://localhost:11434"
            className="w-full px-4 py-2.5 bg-[var(--bg-elevated)] border border-white/[0.06] rounded-xl
                       text-sm text-[var(--text-primary)]
                       focus:outline-none focus:border-[var(--cyan-glow)]/30 focus:ring-1 focus:ring-[var(--cyan-glow)]/20
                       transition-all"
          />
          {errors.baseUrl && (
            <p className="text-xs text-[var(--rose)] mt-1">{errors.baseUrl}</p>
          )}
        </div>
      )}

      {/* API Key (for OpenAI, Anthropic, OpenRouter) */}
      {requiresApiKey(providerType) && (
        <div>
          <label className="block text-sm text-[var(--text-muted)] mb-2">
            API Key {existingSettings && "(leave empty to keep existing)"}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={existingSettings ? "••••••••••••••••" : "Enter API key"}
            className="w-full px-4 py-2.5 bg-[var(--bg-elevated)] border border-white/[0.06] rounded-xl
                       text-sm text-[var(--text-primary)]
                       focus:outline-none focus:border-[var(--cyan-glow)]/30 focus:ring-1 focus:ring-[var(--cyan-glow)]/20
                       transition-all"
          />
          {errors.apiKey && (
            <p className="text-xs text-[var(--rose)] mt-1">{errors.apiKey}</p>
          )}
        </div>
      )}

      {/* Test Connection */}
      <div>
        <button
          onClick={handleTestConnection}
          disabled={testConnectionMutation.isPending}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)]
                     text-[var(--text-primary)] hover:bg-[var(--bg-hover)]
                     transition-all text-sm font-medium
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <TestTube className="w-4 h-4" />
          Test Connection
        </button>
      </div>

      {/* Connection Status */}
      <ConnectionStatus
        status={connectionStatus}
        latencyMs={connectionResult?.latencyMs}
        error={connectionResult?.error}
      />
      {errors.connection && (
        <p className="text-xs text-[var(--rose)] -mt-2">{errors.connection}</p>
      )}

      {/* Model Selection */}
      <div>
        <label className="block text-sm text-[var(--text-muted)] mb-2">
          Model
        </label>
        <ModelSelector
          providerType={providerType}
          baseUrl={requiresBaseUrl(providerType) ? baseUrl : undefined}
          apiKey={requiresApiKey(providerType) ? apiKey : undefined}
          value={selectedModel}
          onChange={setSelectedModel}
          disabled={connectionStatus !== "connected"}
        />
        {errors.model && (
          <p className="text-xs text-[var(--rose)] mt-1">{errors.model}</p>
        )}
      </div>

      {/* Set as Default Toggle */}
      {existingSettings && !isDefault && (
        <div className="flex items-center justify-between py-4 border-t border-white/[0.04]">
          <div>
            <div className="font-medium text-[var(--text-primary)]">
              Set as Default
            </div>
            <div className="text-sm text-[var(--text-muted)]">
              Use this provider for all new tasks
            </div>
          </div>
          <button
            onClick={handleSetDefault}
            disabled={setDefaultMutation.isPending}
            className="px-4 py-2 rounded-lg bg-[var(--cyan-glow)]/10 text-[var(--cyan-glow)]
                       hover:bg-[var(--cyan-glow)]/20 transition-all text-sm font-medium
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Set Default
          </button>
        </div>
      )}

      {isDefault && (
        <div className="flex items-center gap-2 px-4 py-2 bg-[var(--emerald)]/10 border border-[var(--emerald)]/20 rounded-xl">
          <div className="w-2 h-2 rounded-full bg-[var(--emerald)]" />
          <span className="text-sm text-[var(--emerald)] font-medium">
            This is the default provider
          </span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-4 border-t border-white/[0.04]">
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                     bg-[var(--cyan-glow)] text-[var(--bg-deep)]
                     hover:bg-[var(--cyan-glow)]/90
                     transition-all text-sm font-semibold
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          {existingSettings ? "Update" : "Save"} Settings
        </button>

        {existingSettings && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleteMutation.isPending}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                       bg-[var(--bg-elevated)] text-[var(--rose)]
                       hover:bg-[var(--rose)]/10
                       transition-all text-sm font-medium
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        )}
      </div>

      {errors.submit && (
        <p className="text-sm text-[var(--rose)]">{errors.submit}</p>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[var(--bg-card)] border border-white/[0.04] rounded-2xl p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
              Delete Provider Settings?
            </h3>
            <p className="text-sm text-[var(--text-muted)] mb-6">
              Are you sure you want to delete this provider configuration? This action
              cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)]
                           text-[var(--text-primary)] hover:bg-[var(--bg-hover)]
                           transition-all text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleDelete();
                  setShowDeleteConfirm(false);
                }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--rose)]
                           text-white hover:bg-[var(--rose)]/90
                           transition-all text-sm font-semibold"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
