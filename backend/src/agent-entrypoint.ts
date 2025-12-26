#!/usr/bin/env node
/**
 * Agent Container Entry Point
 *
 * This script serves as the main entry point for the agent container.
 * It parses environment variables, creates an LLM provider, and executes
 * a task using the AgentEngineService.
 *
 * Environment Variables:
 * - TASK_ID: The ID of the beads issue to execute (required)
 * - LLM_PROVIDER: The LLM provider type: ollama|openai|anthropic|openrouter (required)
 * - LLM_MODEL: The model name to use (required)
 * - LLM_BASE_URL: Custom base URL for the LLM provider (optional, uses provider default if not set)
 * - ANTHROPIC_API_KEY: API key for Anthropic provider
 * - OPENAI_API_KEY: API key for OpenAI provider
 * - OPENROUTER_API_KEY: API key for OpenRouter provider
 * - MAX_ITERATIONS: Maximum iterations for agent loop (default: 10)
 * - NODE_ENV: Set to 'production' in containers
 *
 * Exit Codes:
 * - 0: Task completed successfully
 * - 1: Task execution failed (retryable error)
 * - 2: Configuration error (non-retryable, e.g., missing required env vars)
 */

import { ProviderFactory, type ProviderType } from "./features/llm-providers/factory/provider.factory.js";
import type { ProviderConfig } from "./features/llm-providers/providers/base-provider.js";
import { AgentEngineService } from "./features/agent-runtime/services/agent-engine.service.js";

/**
 * Parse and validate agent configuration from environment variables
 */
function parseAgentConfig() {
  const taskId = process.env.TASK_ID;
  if (!taskId) {
    console.error("ERROR: TASK_ID environment variable is required");
    process.exit(2);
  }

  const llmProvider = (process.env.LLM_PROVIDER || "ollama") as ProviderType;
  const validProviders: ProviderType[] = ["ollama", "openai", "anthropic", "openrouter"];
  if (!validProviders.includes(llmProvider)) {
    console.error(`ERROR: Invalid LLM_PROVIDER: ${llmProvider}. Must be one of: ${validProviders.join(", ")}`);
    process.exit(2);
  }

  const llmModel = process.env.LLM_MODEL;
  if (!llmModel) {
    console.error("ERROR: LLM_MODEL environment variable is required");
    process.exit(2);
  }

  const llmBaseUrl = process.env.LLM_BASE_URL;
  const maxIterations = parseInt(process.env.MAX_ITERATIONS || "10", 10);

  if (isNaN(maxIterations) || maxIterations < 1) {
    console.error("ERROR: MAX_ITERATIONS must be a positive number");
    process.exit(2);
  }

  return {
    taskId,
    llmProvider,
    llmModel,
    llmBaseUrl,
    maxIterations,
  };
}

/**
 * Create provider configuration based on environment
 */
function createProviderConfig(llmProvider: ProviderType, llmModel: string, llmBaseUrl?: string): ProviderConfig {
  // Determine base URL with defaults
  let baseUrl = llmBaseUrl;
  if (!baseUrl) {
    switch (llmProvider) {
      case "ollama":
        baseUrl = "http://localhost:11434";
        break;
      case "openai":
        baseUrl = "https://api.openai.com";
        break;
      case "anthropic":
        baseUrl = "https://api.anthropic.com";
        break;
      case "openrouter":
        baseUrl = "https://openrouter.ai";
        break;
      default:
        throw new Error(`Unknown provider: ${llmProvider}`);
    }
  }

  const baseConfig: ProviderConfig = {
    model: llmModel,
    baseUrl,
  };

  // Add API key based on provider
  switch (llmProvider) {
    case "anthropic":
      return {
        ...baseConfig,
        apiKey: process.env.ANTHROPIC_API_KEY,
      };
    case "openai":
      return {
        ...baseConfig,
        apiKey: process.env.OPENAI_API_KEY,
      };
    case "openrouter":
      return {
        ...baseConfig,
        apiKey: process.env.OPENROUTER_API_KEY,
      };
    case "ollama":
      // Ollama doesn't require an API key
      return baseConfig;
    default:
      throw new Error(`Unknown provider: ${llmProvider}`);
  }
}

/**
 * Main agent execution function
 */
async function main() {
  try {
    console.log("Agent container starting...");

    // Parse configuration
    const config = parseAgentConfig();
    console.log(`Task: ${config.taskId}`);
    console.log(`Provider: ${config.llmProvider}`);
    console.log(`Model: ${config.llmModel}`);
    if (config.llmBaseUrl) {
      console.log(`Base URL: ${config.llmBaseUrl}`);
    }

    // Create provider
    console.log("Creating LLM provider...");
    const providerConfig = createProviderConfig(config.llmProvider, config.llmModel, config.llmBaseUrl);
    const provider = ProviderFactory.createProvider(config.llmProvider, providerConfig);

    // Create agent engine
    console.log("Initializing agent engine...");
    const engine = new AgentEngineService({
      llmProvider: provider,
      workspacePath: "/workspace",
      maxIterations: config.maxIterations,
    });

    // Execute task
    console.log(`Executing task: ${config.taskId}`);
    const result = await engine.executeTask(config.taskId);

    // Log results
    console.log(`\nTask execution completed`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Tool calls: ${result.toolCallsCount}`);

    if (result.success) {
      console.log("Task completed successfully");
      if (result.finalMessage) {
        console.log(`Final message: ${result.finalMessage}`);
      }
      process.exit(0);
    } else {
      console.error(`Task failed: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error("Agent execution failed:", error instanceof Error ? error.message : String(error));
    if (error instanceof Error) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the agent
main();
