import { BaseProvider } from "./base-provider.js";
import type {
  Message,
  ChatOptions,
  ChatChunk,
  Tool,
  ToolCallResult,
} from "../interfaces/llm-provider.interface.js";

/**
 * Ollama provider for local LLM inference
 * Uses OpenAI-compatible API endpoint
 */
export class OllamaProvider extends BaseProvider {
  /**
   * Stream chat completion using Ollama
   */
  async *chat(
    messages: Message[],
    options?: ChatOptions
  ): AsyncIterable<ChatChunk> {
    const endpoint = this.getEndpoint("v1/chat/completions");

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      stream: true,
    };

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    if (options?.maxTokens !== undefined) {
      body.max_tokens = options.maxTokens;
    }

    if (options?.stopSequences !== undefined && options.stopSequences.length > 0) {
      body.stop = options.stopSequences;
    }

    yield* this.streamRequest(endpoint, body);
  }

  /**
   * Check if Ollama supports tool calling
   * Note: Tool calling support depends on the model being used
   */
  supportsToolCalling(): boolean {
    // Most Ollama models don't support tool calling yet
    // This could be enhanced to check model capabilities
    return false;
  }

  /**
   * Call with tools (not supported by most Ollama models)
   */
  async callWithTools(
    messages: Message[],
    tools: Tool[]
  ): Promise<ToolCallResult> {
    throw new Error(
      "Tool calling is not supported by Ollama provider. Use a different provider for tool calling functionality."
    );
  }
}
