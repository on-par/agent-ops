import { Loader2, AlertCircle } from "lucide-react";
import { useAvailableModels } from "../../hooks/use-provider-settings";
import type { ProviderType } from "../../types/llm-provider";

interface ModelSelectorProps {
  providerType?: ProviderType;
  baseUrl?: string;
  apiKey?: string;
  value?: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
}

export function ModelSelector({
  providerType,
  baseUrl,
  apiKey,
  value,
  onChange,
  disabled = false,
}: ModelSelectorProps) {
  const {
    data: models,
    isLoading,
    error,
  } = useAvailableModels(providerType, baseUrl, apiKey);

  const formatContextWindow = (tokens?: number) => {
    if (!tokens) return "";
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}k`;
    return tokens.toString();
  };

  const formatPricing = (pricing?: {
    inputCostPer1kTokens: number;
    outputCostPer1kTokens: number;
  }) => {
    if (!pricing) return "";
    return ` - $${pricing.inputCostPer1kTokens.toFixed(3)}/$${pricing.outputCostPer1kTokens.toFixed(3)} per 1k tokens`;
  };

  if (!providerType) {
    return (
      <div className="px-4 py-3 bg-[var(--bg-elevated)] border border-white/[0.06] rounded-xl">
        <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>Select a provider first</span>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="px-4 py-3 bg-[var(--bg-elevated)] border border-white/[0.06] rounded-xl">
        <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading available models...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-3 bg-[var(--bg-elevated)] border border-red-500/20 rounded-xl">
        <div className="flex items-center gap-2 text-[var(--rose)] text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>Failed to load models: {(error as Error).message}</span>
        </div>
      </div>
    );
  }

  if (!models || models.length === 0) {
    return (
      <div className="px-4 py-3 bg-[var(--bg-elevated)] border border-white/[0.06] rounded-xl">
        <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>No models available for this provider</span>
        </div>
      </div>
    );
  }

  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full px-4 py-2.5 bg-[var(--bg-elevated)] border border-white/[0.06] rounded-xl
                 text-sm text-[var(--text-primary)]
                 focus:outline-none focus:border-[var(--cyan-glow)]/30 focus:ring-1 focus:ring-[var(--cyan-glow)]/20
                 transition-all
                 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <option value="">Select a model...</option>
      {models.map((model) => {
        const contextInfo = model.contextWindow
          ? ` (context: ${formatContextWindow(model.contextWindow)} tokens)`
          : "";
        const pricingInfo = formatPricing(model.pricing);
        const displayText = `${model.name}${contextInfo}${pricingInfo}`;

        return (
          <option key={model.id} value={model.id} title={model.description}>
            {displayText}
          </option>
        );
      })}
    </select>
  );
}
