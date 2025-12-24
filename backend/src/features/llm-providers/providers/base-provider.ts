import type {
  LLMProvider,
  Message,
  ChatOptions,
  ChatChunk,
  Tool,
  ToolCallResult,
} from "../interfaces/llm-provider.interface.js";

/**
 * Configuration for HTTP-based LLM providers
 */
export interface ProviderConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
}

/**
 * Base class for LLM providers using OpenAI-compatible API
 * Provides common HTTP request logic that can be extended by specific providers
 */
export abstract class BaseProvider implements LLMProvider {
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  /**
   * Build headers for API requests
   * Override this method to customize headers for specific providers
   */
  protected getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  /**
   * Build the API endpoint URL
   * Override this method to customize endpoint for specific providers
   */
  protected getEndpoint(path: string): string {
    const baseUrl = this.config.baseUrl.replace(/\/$/, "");
    const cleanPath = path.replace(/^\//, "");
    return `${baseUrl}/${cleanPath}`;
  }

  /**
   * Make a streaming API request
   */
  protected async *streamRequest(
    endpoint: string,
    body: Record<string, unknown>
  ): AsyncIterable<ChatChunk> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    if (!response.body) {
      throw new Error("Response body is null");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const content = this.extractContentFromChunk(parsed);
              const finishReason = this.extractFinishReasonFromChunk(parsed);

              if (content || finishReason) {
                yield { content: content || "", finishReason };
              }
            } catch (error) {
              // Skip invalid JSON lines
              console.warn("Failed to parse SSE chunk:", error);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Make a non-streaming API request
   */
  protected async makeRequest(
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<unknown> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    return response.json();
  }

  /**
   * Extract content from a streaming chunk
   * Override this for provider-specific response formats
   */
  protected extractContentFromChunk(chunk: unknown): string {
    // Default OpenAI format
    const data = chunk as { choices?: Array<{ delta?: { content?: string } }> };
    return data.choices?.[0]?.delta?.content || "";
  }

  /**
   * Extract finish reason from a streaming chunk
   * Override this for provider-specific response formats
   */
  protected extractFinishReasonFromChunk(
    chunk: unknown
  ): "stop" | "length" | "tool_calls" | null {
    // Default OpenAI format
    const data = chunk as { choices?: Array<{ finish_reason?: string | null }> };
    const reason = data.choices?.[0]?.finish_reason;
    if (!reason) return null;
    if (reason === "stop" || reason === "length" || reason === "tool_calls") {
      return reason;
    }
    return null;
  }

  // Abstract methods to be implemented by specific providers
  abstract chat(
    messages: Message[],
    options?: ChatOptions
  ): AsyncIterable<ChatChunk>;
  abstract supportsToolCalling(): boolean;
  abstract callWithTools(
    messages: Message[],
    tools: Tool[]
  ): Promise<ToolCallResult>;
}
