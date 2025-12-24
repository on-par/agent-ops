import { BaseProvider } from "./base-provider.js";
import type {
  Message,
  ChatOptions,
  ChatChunk,
  Tool,
  ToolCallResult,
  ToolCall,
} from "../interfaces/llm-provider.interface.js";

/**
 * OpenRouter provider for accessing multiple LLM providers
 * Uses OpenAI-compatible API: https://openrouter.ai/api
 */
export class OpenRouterProvider extends BaseProvider {
  /**
   * Build headers for OpenRouter API
   * OpenRouter accepts OpenAI-style bearer token but also has special headers
   */
  protected getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/agent-ops",
      "X-Title": "Agent Ops",
    };

    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  /**
   * Stream chat completion using OpenRouter
   */
  async *chat(
    messages: Message[],
    options?: ChatOptions
  ): AsyncIterable<ChatChunk> {
    const endpoint = this.getEndpoint("api/v1/chat/completions");

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
   * OpenRouter supports tool calling (depends on the underlying model)
   */
  supportsToolCalling(): boolean {
    // Most modern models on OpenRouter support tool calling
    return true;
  }

  /**
   * Call OpenRouter with tool definitions
   */
  async callWithTools(
    messages: Message[],
    tools: Tool[]
  ): Promise<ToolCallResult> {
    const endpoint = this.getEndpoint("api/v1/chat/completions");

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      tools: tools.map(tool => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      })),
      tool_choice: "auto",
    };

    const response = await this.makeRequest(endpoint, body);
    const data = response as {
      choices: Array<{
        message: {
          content?: string;
          tool_calls?: Array<{
            id: string;
            function: {
              name: string;
              arguments: string;
            };
          }>;
        };
        finish_reason: string;
      }>;
    };

    const choice = data.choices[0];
    if (!choice) {
      throw new Error("No choices returned from OpenRouter API");
    }

    const message = choice.message;

    const toolCalls: ToolCall[] | undefined = message.tool_calls?.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      input: JSON.parse(tc.function.arguments),
    }));

    return {
      content: message.content ?? undefined,
      toolCalls,
      finishReason: this.mapFinishReason(choice.finish_reason),
    };
  }

  private mapFinishReason(reason: string): "stop" | "tool_calls" | "length" {
    if (reason === "stop" || reason === "tool_calls" || reason === "length") {
      return reason;
    }
    return "stop";
  }
}
