import type { LLMProvider } from "../interfaces/llm-provider.interface.js";
import type { ProviderConfig } from "../providers/base-provider.js";
import { OllamaProvider } from "../providers/ollama.provider.js";
import { OpenAIProvider } from "../providers/openai.provider.js";
import { AnthropicProvider } from "../providers/anthropic.provider.js";
import { OpenRouterProvider } from "../providers/openrouter.provider.js";

export type ProviderType = "ollama" | "openai" | "anthropic" | "openrouter";

/**
 * Factory for creating LLM provider instances
 */
export class ProviderFactory {
  /**
   * Create an LLM provider instance based on the provider type
   * @param type - Provider type (ollama, openai, anthropic, openrouter)
   * @param config - Provider configuration
   * @returns LLM provider instance
   */
  static createProvider(type: ProviderType, config: ProviderConfig): LLMProvider {
    switch (type) {
      case "ollama":
        return new OllamaProvider(config);
      case "openai":
        return new OpenAIProvider(config);
      case "anthropic":
        return new AnthropicProvider(config);
      case "openrouter":
        return new OpenRouterProvider(config);
      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }

  /**
   * Get default base URL for a provider type
   * @param type - Provider type
   * @returns Default base URL
   */
  static getDefaultBaseUrl(type: ProviderType): string {
    switch (type) {
      case "ollama":
        return "http://localhost:11434";
      case "openai":
        return "https://api.openai.com";
      case "anthropic":
        return "https://api.anthropic.com";
      case "openrouter":
        return "https://openrouter.ai";
      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }
}
