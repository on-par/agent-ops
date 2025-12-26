import type { ProviderType as BaseProviderType } from "../factory/provider.factory.js";

// Re-export for convenience
export type ProviderType = BaseProviderType;

/**
 * Provider settings input for creating/updating settings
 */
export interface ProviderSettingsInput {
  providerType: ProviderType;
  baseUrl?: string;
  apiKey?: string;
  model: string;
  isDefault?: boolean;
}

/**
 * Provider settings as stored in database
 */
export interface ProviderSettings {
  id: string;
  providerType: ProviderType;
  baseUrl: string | null;
  apiKeyEncrypted: string | null;
  model: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Provider settings API response (excludes encrypted key)
 */
export interface ProviderSettingsResponse {
  id: string;
  providerType: ProviderType;
  baseUrl: string | null;
  model: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
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
