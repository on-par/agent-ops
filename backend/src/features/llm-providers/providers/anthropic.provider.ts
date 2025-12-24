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
 * Anthropic provider for Claude models
 * Uses Anthropic API: https://api.anthropic.com
 */
export class AnthropicProvider extends BaseProvider {
  /**
   * Build headers for Anthropic API
   * Anthropic uses different header format than OpenAI
   */
  protected getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-api-key": this.config.apiKey || "",
      "anthropic-version": "2023-06-01",
    };
  }

  /**
   * Stream chat completion using Anthropic
   */
  async *chat(
    messages: Message[],
    options?: ChatOptions
  ): AsyncIterable<ChatChunk> {
    const endpoint = this.getEndpoint("v1/messages");

    const systemMessage = messages.find(msg => msg.role === "system");
    const conversationMessages = messages.filter(msg => msg.role !== "system");

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: conversationMessages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      max_tokens: options?.maxTokens || 4096,
      stream: true,
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }

    if (options?.stopSequences !== undefined && options.stopSequences.length > 0) {
      body.stop_sequences = options.stopSequences;
    }

    yield* this.streamRequest(endpoint, body);
  }

  /**
   * Extract content from Anthropic streaming chunk
   */
  protected extractContentFromChunk(chunk: unknown): string {
    const data = chunk as {
      type?: string;
      delta?: { type?: string; text?: string };
      content_block?: { type?: string; text?: string };
    };

    if (data.type === "content_block_delta" && data.delta?.text) {
      return data.delta.text;
    }

    return "";
  }

  /**
   * Extract finish reason from Anthropic streaming chunk
   */
  protected extractFinishReasonFromChunk(
    chunk: unknown
  ): "stop" | "length" | "tool_calls" | null {
    const data = chunk as {
      type?: string;
      delta?: { stop_reason?: string };
      message?: { stop_reason?: string };
    };

    if (data.type === "message_delta" && data.delta?.stop_reason) {
      return this.mapFinishReason(data.delta.stop_reason);
    }

    if (data.type === "message_stop" && data.message?.stop_reason) {
      return this.mapFinishReason(data.message.stop_reason);
    }

    return null;
  }

  /**
   * Anthropic supports tool calling
   */
  supportsToolCalling(): boolean {
    return true;
  }

  /**
   * Call Anthropic with tool definitions
   */
  async callWithTools(
    messages: Message[],
    tools: Tool[]
  ): Promise<ToolCallResult> {
    const endpoint = this.getEndpoint("v1/messages");

    const systemMessage = messages.find(msg => msg.role === "system");
    const conversationMessages = messages.filter(msg => msg.role !== "system");

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: conversationMessages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      max_tokens: 4096,
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      })),
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    const response = await this.makeRequest(endpoint, body);
    const data = response as {
      content: Array<
        | { type: "text"; text: string }
        | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
      >;
      stop_reason: string;
    };

    let content: string | undefined;
    const toolCalls: ToolCall[] = [];

    for (const block of data.content) {
      if (block.type === "text") {
        content = block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input,
        });
      }
    }

    return {
      content: content ?? undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: this.mapFinishReason(data.stop_reason),
    };
  }

  private mapFinishReason(reason: string): "stop" | "tool_calls" | "length" {
    if (reason === "end_turn") return "stop";
    if (reason === "tool_use") return "tool_calls";
    if (reason === "max_tokens") return "length";
    return "stop";
  }
}
