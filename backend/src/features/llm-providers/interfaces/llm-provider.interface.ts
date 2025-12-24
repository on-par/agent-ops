/**
 * Message type for LLM chat
 */
export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Options for chat completion
 */
export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  stopSequences?: string[];
}

/**
 * Chunk of streamed chat response
 */
export interface ChatChunk {
  content: string;
  finishReason?: "stop" | "length" | "tool_calls" | null;
}

/**
 * Tool definition for function calling
 */
export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Result of a tool call
 */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Result of calling LLM with tools
 */
export interface ToolCallResult {
  content?: string | undefined;
  toolCalls?: ToolCall[] | undefined;
  finishReason: "stop" | "tool_calls" | "length";
}

/**
 * Provider-agnostic LLM interface
 * All providers implement this interface to enable swapping between different LLM services
 */
export interface LLMProvider {
  /**
   * Stream chat completion responses
   * @param messages - Conversation history
   * @param options - Chat options (temperature, max tokens, etc.)
   * @returns Async iterable of chat chunks
   */
  chat(messages: Message[], options?: ChatOptions): AsyncIterable<ChatChunk>;

  /**
   * Check if provider supports tool/function calling
   * @returns True if provider supports tool calling
   */
  supportsToolCalling(): boolean;

  /**
   * Call LLM with tool definitions and get tool calls
   * @param messages - Conversation history
   * @param tools - Available tools
   * @returns Tool call result with content and/or tool calls
   */
  callWithTools(messages: Message[], tools: Tool[]): Promise<ToolCallResult>;
}
