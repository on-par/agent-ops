import { Circle, Loader2, CheckCircle, XCircle } from "lucide-react";
import type { ConnectionStatus as ConnectionStatusType } from "../../types/llm-provider";

interface ConnectionStatusProps {
  status: ConnectionStatusType;
  latencyMs?: number;
  error?: string;
  modelName?: string;
}

export function ConnectionStatus({
  status,
  latencyMs,
  error,
  modelName,
}: ConnectionStatusProps) {
  const getStatusConfig = () => {
    switch (status) {
      case "idle":
        return {
          icon: Circle,
          color: "var(--text-muted)",
          bgColor: "var(--bg-elevated)",
          text: "Not configured",
          animate: false,
        };
      case "testing":
        return {
          icon: Loader2,
          color: "var(--blue)",
          bgColor: "color-mix(in srgb, var(--blue) 10%, transparent)",
          text: "Testing connection...",
          animate: true,
        };
      case "connected":
        return {
          icon: CheckCircle,
          color: "var(--emerald)",
          bgColor: "color-mix(in srgb, var(--emerald) 10%, transparent)",
          text: modelName ? `Connected - ${modelName}` : "Connected",
          animate: false,
        };
      case "error":
        return {
          icon: XCircle,
          color: "var(--rose)",
          bgColor: "color-mix(in srgb, var(--rose) 10%, transparent)",
          text: "Connection failed",
          animate: false,
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <div className="space-y-2">
      <div
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.06] transition-all"
        style={{
          backgroundColor: config.bgColor,
          borderColor: `color-mix(in srgb, ${config.color} 20%, transparent)`,
        }}
      >
        <Icon
          className={`w-4 h-4 ${config.animate ? "animate-spin" : ""}`}
          style={{ color: config.color }}
        />
        <span
          className="text-sm font-medium"
          style={{ color: config.color }}
        >
          {config.text}
        </span>
      </div>

      {status === "connected" && latencyMs !== undefined && (
        <div className="text-xs text-[var(--text-muted)] pl-1">
          Latency: {latencyMs}ms
        </div>
      )}

      {status === "error" && error && (
        <div className="text-xs text-[var(--rose)] pl-1 max-w-md">
          {error}
        </div>
      )}
    </div>
  );
}
