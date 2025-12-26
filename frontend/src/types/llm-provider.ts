/**
 * Available LLM provider types
 */
export type ProviderType = "ollama" | "openai" | "anthropic" | "openrouter";

/**
 * Provider settings as returned from the API
 */
export interface ProviderSettings {
  id: string;
  providerType: ProviderType;
  baseUrl: string | null;
  model: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Provider settings input for creating/updating
 */
export interface ProviderSettingsInput {
  providerType: ProviderType;
  baseUrl?: string;
  apiKey?: string;
  model: string;
  isDefault?: boolean;
}

/**
 * Result of testing provider connection
 */
export interface ConnectionTestResult {
  success: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * Available model from a provider
 */
export interface AvailableModel {
  id: string;
  name: string;
  contextWindow?: number;
  description?: string;
  pricing?: {
    inputCostPer1kTokens: number;
    outputCostPer1kTokens: number;
  };
}

/**
 * Connection status for UI display
 */
export type ConnectionStatus = "idle" | "testing" | "connected" | "error";
