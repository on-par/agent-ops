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
 * OpenAI provider for GPT models
 * Uses OpenAI API: https://api.openai.com/v1
 */
export class OpenAIProvider extends BaseProvider {
  /**
   * Stream chat completion using OpenAI
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
   * OpenAI supports tool calling
   */
  supportsToolCalling(): boolean {
    return true;
  }

  /**
   * Call OpenAI with tool definitions
   */
  async callWithTools(
    messages: Message[],
    tools: Tool[]
  ): Promise<ToolCallResult> {
    const endpoint = this.getEndpoint("v1/chat/completions");

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
      throw new Error("No choices returned from OpenAI API");
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
