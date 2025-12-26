import crypto from "node:crypto";
import { nanoid } from "nanoid";
import { ProviderSettingsRepository } from "../repositories/provider-settings.repository.js";
import type { ProviderSettingsRecord } from "../../../shared/db/schema.js";
import type {
  ProviderSettingsInput,
  ProviderSettingsResponse,
  ConnectionTestResult,
  AvailableModel,
} from "../types/provider-settings.types.js";
import type { ProviderType } from "../factory/provider.factory.js";
import { ProviderFactory } from "../factory/provider.factory.js";

/**
 * Service for managing LLM provider settings
 * Handles business logic for provider configuration including encryption, validation, and testing
 */
export class ProviderSettingsService {
  // Encryption key from environment or default for development
  private readonly encryptionKey: Buffer;
  private readonly algorithm = "aes-256-gcm";

  constructor(private repository: ProviderSettingsRepository) {
    // Get encryption key from environment or generate a default one
    const key = process.env.ENCRYPTION_KEY || "dev-encryption-key-32-chars!!";
    this.encryptionKey = crypto.scryptSync(key, "salt", 32);
  }

  /**
   * Get provider settings by ID
   * @param id - Provider settings ID
   * @returns Provider settings with masked API key
   * @throws Error if settings not found
   */
  async getSettings(id: string): Promise<ProviderSettingsResponse> {
    const record = await this.repository.findById(id);

    if (!record) {
      throw new Error("Provider settings not found");
    }

    return this.toResponse(record);
  }

  /**
   * Get all provider settings
   * @returns Array of all provider settings with masked API keys
   */
  async getAllSettings(): Promise<ProviderSettingsResponse[]> {
    const records = await this.repository.findAll();
    return records.map((record) => this.toResponse(record));
  }

  /**
   * Create new provider settings
   * @param input - Provider settings input data
   * @returns Created provider settings
   */
  async createSettings(
    input: ProviderSettingsInput
  ): Promise<ProviderSettingsResponse> {
    const now = new Date();
    const id = nanoid();

    // Encrypt API key if provided
    const apiKeyEncrypted = input.apiKey
      ? this.encryptApiKey(input.apiKey)
      : null;

    // Use provided baseUrl or default for the provider type
    const baseUrl =
      input.baseUrl || ProviderFactory.getDefaultBaseUrl(input.providerType);

    const record = await this.repository.create({
      id,
      providerType: input.providerType,
      baseUrl,
      apiKeyEncrypted,
      model: input.model,
      isDefault: input.isDefault ?? false,
      createdAt: now,
      updatedAt: now,
    });

    return this.toResponse(record);
  }

  /**
   * Update existing provider settings
   * @param id - Provider settings ID
   * @param input - Partial provider settings input data
   * @returns Updated provider settings
   * @throws Error if settings not found
   */
  async updateSettings(
    id: string,
    input: Partial<ProviderSettingsInput>
  ): Promise<ProviderSettingsResponse> {
    // Verify settings exist
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new Error("Provider settings not found");
    }

    const updateData: Partial<{
      providerType: ProviderType;
      baseUrl: string;
      apiKeyEncrypted: string | null;
      model: string;
      isDefault: boolean;
      updatedAt: Date;
    }> = {
      updatedAt: new Date(),
    };

    // Update fields if provided
    if (input.providerType) {
      updateData.providerType = input.providerType;
    }
    if (input.baseUrl !== undefined) {
      updateData.baseUrl = input.baseUrl;
    }
    if (input.apiKey !== undefined) {
      updateData.apiKeyEncrypted = input.apiKey
        ? this.encryptApiKey(input.apiKey)
        : null;
    }
    if (input.model) {
      updateData.model = input.model;
    }
    if (input.isDefault !== undefined) {
      updateData.isDefault = input.isDefault;
    }

    const updated = await this.repository.update(id, updateData);
    return this.toResponse(updated);
  }

  /**
   * Delete provider settings
   * @param id - Provider settings ID
   */
  async deleteSettings(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  /**
   * Get default provider settings
   * @returns Default provider settings or null if none is set
   */
  async getDefaultSettings(): Promise<ProviderSettingsResponse | null> {
    const record = await this.repository.findDefault();
    return record ? this.toResponse(record) : null;
  }

  /**
   * Set a provider as default
   * @param id - Provider settings ID to set as default
   * @returns Updated provider settings
   */
  async setDefaultSettings(id: string): Promise<ProviderSettingsResponse> {
    const updated = await this.repository.setAsDefault(id);
    return this.toResponse(updated);
  }

  /**
   * Test connection to a provider
   * @param providerType - Provider type
   * @param baseUrl - Base URL (optional, uses default if not provided)
   * @param apiKey - API key (optional, required for some providers)
   * @returns Connection test result
   */
  async testConnection(
    providerType: ProviderType,
    baseUrl?: string,
    apiKey?: string
  ): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    try {
      // Use default baseUrl if not provided
      const url = baseUrl || ProviderFactory.getDefaultBaseUrl(providerType);

      // Test based on provider type
      switch (providerType) {
        case "ollama":
          await this.testOllamaConnection(url);
          break;
        case "openai":
          await this.testOpenAIConnection(url, apiKey);
          break;
        case "anthropic":
          await this.testAnthropicConnection(url, apiKey);
          break;
        case "openrouter":
          await this.testOpenRouterConnection(url, apiKey);
          break;
        default:
          throw new Error(`Unsupported provider type: ${providerType}`);
      }

      const latencyMs = Date.now() - startTime;

      return {
        success: true,
        latencyMs,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Fetch available models from a provider
   * @param providerType - Provider type
   * @param baseUrl - Base URL (optional, uses default if not provided)
   * @param apiKey - API key (optional, required for some providers)
   * @returns List of available models
   */
  async fetchAvailableModels(
    providerType: ProviderType,
    baseUrl?: string,
    apiKey?: string
  ): Promise<AvailableModel[]> {
    const url = baseUrl || ProviderFactory.getDefaultBaseUrl(providerType);

    switch (providerType) {
      case "ollama":
        return this.fetchOllamaModels(url);
      case "openai":
        if (!apiKey) {
          throw new Error("API key is required for OpenAI");
        }
        return this.fetchOpenAIModels(url, apiKey);
      case "anthropic":
        return this.getAnthropicModels();
      case "openrouter":
        return this.fetchOpenRouterModels(url, apiKey);
      default:
        throw new Error(`Unsupported provider type: ${providerType}`);
    }
  }

  // Private helper methods

  /**
   * Convert database record to API response
   */
  private toResponse(record: ProviderSettingsRecord): ProviderSettingsResponse {
    return {
      id: record.id,
      providerType: record.providerType as ProviderType,
      baseUrl: record.baseUrl,
      model: record.model,
      isDefault: record.isDefault,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  /**
   * Encrypt API key using AES-256-GCM
   */
  private encryptApiKey(apiKey: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

    let encrypted = cipher.update(apiKey, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // Return format: iv:authTag:encrypted
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  }

  /**
   * Decrypt API key
   */
  private decryptApiKey(encryptedKey: string): string {
    const parts = encryptedKey.split(":");
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
      throw new Error("Invalid encrypted key format");
    }

    const iv = Buffer.from(parts[0]!, "hex");
    const authTag = Buffer.from(parts[1]!, "hex");
    const encrypted = parts[2]!;

    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.encryptionKey,
      iv
    );
    decipher.setAuthTag(authTag);

    const decrypted1 = decipher.update(encrypted, "hex" as BufferEncoding);
    const decrypted2 = decipher.final();
    const decryptedBuffer = Buffer.concat([decrypted1, decrypted2]);

    return decryptedBuffer.toString("utf8");
  }

  /**
   * Mask API key showing only last 4 characters
   */
  private maskApiKey(key: string): string {
    if (key.length <= 4) {
      return "****";
    }
    return "****" + key.slice(-4);
  }

  // Connection testing methods

  private async testOllamaConnection(baseUrl: string): Promise<void> {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: "GET",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Ollama connection failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }
  }

  private async testOpenAIConnection(
    baseUrl: string,
    apiKey?: string
  ): Promise<void> {
    if (!apiKey) {
      throw new Error("API key is required for OpenAI");
    }

    const response = await fetch(`${baseUrl}/v1/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenAI connection failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }
  }

  private async testAnthropicConnection(
    baseUrl: string,
    apiKey?: string
  ): Promise<void> {
    if (!apiKey) {
      throw new Error("API key is required for Anthropic");
    }

    // Anthropic doesn't have a simple list models endpoint
    // We'll do a minimal request to verify credentials
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1,
        messages: [{ role: "user", content: "test" }],
      }),
    });

    // Even a 400 with valid auth is OK - we just want to verify credentials
    if (response.status === 401 || response.status === 403) {
      const errorText = await response.text();
      throw new Error(
        `Anthropic connection failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }
  }

  private async testOpenRouterConnection(
    baseUrl: string,
    apiKey?: string
  ): Promise<void> {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${baseUrl}/api/v1/models`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenRouter connection failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }
  }

  // Model fetching methods

  private async fetchOllamaModels(baseUrl: string): Promise<AvailableModel[]> {
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: "GET",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch Ollama models: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = (await response.json()) as {
      models: Array<{ name: string; size?: number; modified_at?: string }>;
    };

    return data.models.map((model) => ({
      id: model.name,
      name: model.name,
    }));
  }

  private async fetchOpenAIModels(
    baseUrl: string,
    apiKey: string
  ): Promise<AvailableModel[]> {
    const response = await fetch(`${baseUrl}/v1/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch OpenAI models: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = (await response.json()) as {
      data: Array<{ id: string; created: number; owned_by?: string }>;
    };

    // Filter to only GPT models
    return data.data
      .filter((model) => model.id.startsWith("gpt-"))
      .map((model) => ({
        id: model.id,
        name: model.id,
      }));
  }

  private getAnthropicModels(): AvailableModel[] {
    // Anthropic doesn't provide a public models API
    // Return a hardcoded list of available models
    return [
      {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude 3.5 Sonnet",
        contextWindow: 200000,
        description: "Most intelligent model, best for complex tasks",
      },
      {
        id: "claude-3-5-haiku-20241022",
        name: "Claude 3.5 Haiku",
        contextWindow: 200000,
        description: "Fastest model, best for simple tasks",
      },
      {
        id: "claude-3-opus-20240229",
        name: "Claude 3 Opus",
        contextWindow: 200000,
        description: "Previous generation flagship model",
      },
      {
        id: "claude-3-sonnet-20240229",
        name: "Claude 3 Sonnet",
        contextWindow: 200000,
        description: "Previous generation balanced model",
      },
      {
        id: "claude-3-haiku-20240307",
        name: "Claude 3 Haiku",
        contextWindow: 200000,
        description: "Previous generation fast model",
      },
    ];
  }

  private async fetchOpenRouterModels(
    baseUrl: string,
    apiKey?: string
  ): Promise<AvailableModel[]> {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${baseUrl}/api/v1/models`, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch OpenRouter models: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = (await response.json()) as {
      data: Array<{
        id: string;
        name: string;
        context_length?: number;
        description?: string;
        pricing?: {
          prompt: string;
          completion: string;
        };
      }>;
    };

    return data.data.map((model): AvailableModel => {
      const result: AvailableModel = {
        id: model.id,
        name: model.name,
      };
      if (model.context_length !== undefined) {
        result.contextWindow = model.context_length;
      }
      if (model.description !== undefined) {
        result.description = model.description;
      }
      if (model.pricing) {
        result.pricing = {
          inputCostPer1kTokens: parseFloat(model.pricing.prompt) * 1000,
          outputCostPer1kTokens: parseFloat(model.pricing.completion) * 1000,
        };
      }
      return result;
    });
  }
}
