#!/usr/bin/env node
/* eslint-disable no-console */

import { parseArgs } from "util";
import { AgentEngineService } from "./features/agent-runtime/services/agent-engine.service.js";
import { ProviderFactory, type ProviderType } from "./features/llm-providers/factory/provider.factory.js";
import { simpleGit } from "simple-git";
import { tmpdir } from "os";
import { join } from "path";
import { mkdtemp } from "fs/promises";

/**
 * CLI for running agent tasks without the dashboard
 * For fast iteration and testing
 */

interface CLIArgs {
  taskId: string;
  provider: ProviderType;
  model: string;
  repo?: string | undefined;
  workspace?: string | undefined;
  baseUrl?: string | undefined;
  apiKey?: string | undefined;
  maxIterations?: number | undefined;
}

function printUsage(): void {
  console.log(`
agent-ops - Run agent tasks from the command line

Usage:
  npx agent-ops run <task-id> --provider <provider> --model <model> [options]

Required Arguments:
  <task-id>              Task ID to execute (e.g., agent-ops-4ka.13)
  --provider <name>      LLM provider (ollama, openai, anthropic, openrouter)
  --model <name>         Model name (e.g., qwen2.5-coder:7b, gpt-4, claude-3-5-sonnet-20241022)

Optional Arguments:
  --repo <url>           Git repository URL to clone (default: use --workspace)
  --workspace <path>     Existing workspace path (default: current directory)
  --base-url <url>       Override provider base URL
  --api-key <key>        API key for provider (can also use env vars)
  --max-iterations <n>   Maximum agent iterations (default: 20)
  --help                 Show this help message

Environment Variables:
  OPENAI_API_KEY         API key for OpenAI
  ANTHROPIC_API_KEY      API key for Anthropic
  OPENROUTER_API_KEY     API key for OpenRouter

Examples:
  # Run with local Ollama
  npx agent-ops run agent-ops-4ka.13 \\
    --provider ollama \\
    --model qwen2.5-coder:7b

  # Run with OpenAI on a repo
  npx agent-ops run ISSUE-123 \\
    --provider openai \\
    --model gpt-4 \\
    --repo https://github.com/org/repo

  # Run in existing workspace
  npx agent-ops run TASK-456 \\
    --provider anthropic \\
    --model claude-3-5-sonnet-20241022 \\
    --workspace /path/to/workspace
`);
}

function parseCliArgs(): CLIArgs | null {
  try {
    const { values, positionals } = parseArgs({
      args: process.argv.slice(2),
      options: {
        provider: { type: "string" },
        model: { type: "string" },
        repo: { type: "string" },
        workspace: { type: "string" },
        "base-url": { type: "string" },
        "api-key": { type: "string" },
        "max-iterations": { type: "string" },
        help: { type: "boolean" },
      },
      allowPositionals: true,
    });

    if (values.help) {
      printUsage();
      return null;
    }

    // Check for 'run' command
    if (positionals[0] !== "run") {
      console.error("Error: First argument must be 'run'");
      printUsage();
      process.exit(1);
    }

    const taskId = positionals[1];
    if (!taskId) {
      console.error("Error: Task ID is required");
      printUsage();
      process.exit(1);
    }

    const provider = values.provider as ProviderType;
    if (!provider) {
      console.error("Error: --provider is required");
      printUsage();
      process.exit(1);
    }

    if (!["ollama", "openai", "anthropic", "openrouter"].includes(provider)) {
      console.error(
        `Error: Invalid provider '${provider}'. Must be one of: ollama, openai, anthropic, openrouter`
      );
      process.exit(1);
    }

    const model = values.model;
    if (!model) {
      console.error("Error: --model is required");
      printUsage();
      process.exit(1);
    }

    return {
      taskId,
      provider,
      model,
      repo: values.repo,
      workspace: values.workspace,
      baseUrl: values["base-url"],
      apiKey: values["api-key"],
      maxIterations: values["max-iterations"]
        ? parseInt(values["max-iterations"], 10)
        : undefined,
    };
  } catch (error) {
    console.error("Error parsing arguments:", error instanceof Error ? error.message : "Unknown error");
    printUsage();
    process.exit(1);
  }
}

async function setupWorkspace(args: CLIArgs): Promise<string> {
  // If workspace is provided, use it
  if (args.workspace) {
    console.log(`Using workspace: ${args.workspace}`);
    return args.workspace;
  }

  // If repo is provided, clone it to a temp directory
  if (args.repo) {
    console.log(`Cloning repository: ${args.repo}`);
    const tmpDir = await mkdtemp(join(tmpdir(), "agent-ops-"));
    const git = simpleGit();
    await git.clone(args.repo, tmpDir);
    console.log(`Repository cloned to: ${tmpDir}`);
    return tmpDir;
  }

  // Default to current directory
  console.log("Using current directory as workspace");
  return process.cwd();
}

function getApiKey(provider: ProviderType, cliApiKey?: string): string | undefined {
  if (cliApiKey) {
    return cliApiKey;
  }

  // Check environment variables
  switch (provider) {
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "openrouter":
      return process.env.OPENROUTER_API_KEY;
    case "ollama":
      return undefined; // Ollama doesn't need API key
    default:
      return undefined;
  }
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  if (!args) {
    return; // Help was shown or parsing failed
  }

  console.log("🤖 Agent Ops CLI\n");
  console.log(`Task ID: ${args.taskId}`);
  console.log(`Provider: ${args.provider}`);
  console.log(`Model: ${args.model}\n`);

  try {
    // Setup workspace
    const workspacePath = await setupWorkspace(args);

    // Get API key
    const apiKey = getApiKey(args.provider, args.apiKey);

    // Create LLM provider
    const baseUrl = args.baseUrl || ProviderFactory.getDefaultBaseUrl(args.provider);
    const provider = ProviderFactory.createProvider(args.provider, {
      model: args.model,
      baseUrl,
      apiKey,
    });

    console.log("✓ LLM provider initialized\n");

    // Create agent engine
    const engine = new AgentEngineService({
      llmProvider: provider,
      workspacePath,
      maxIterations: args.maxIterations || 20,
    });

    console.log(`📋 Loading task: ${args.taskId}...`);
    const task = await engine.loadTask(args.taskId);
    console.log(`✓ Task loaded: ${task.title}\n`);
    console.log(`Description:\n${task.description}\n`);

    console.log("🚀 Starting agent execution...\n");
    console.log("─".repeat(60));

    // Execute task
    const result = await engine.executeTask(args.taskId);

    console.log("─".repeat(60));
    console.log("\n📊 Execution Summary:");
    console.log(`  Status: ${result.success ? "✓ Success" : "✗ Failed"}`);
    console.log(`  Iterations: ${result.iterations}`);
    console.log(`  Tool Calls: ${result.toolCallsCount}`);

    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }

    if (result.finalMessage) {
      console.log(`\n💬 Final Message:\n${result.finalMessage}`);
    }

    // Exit with appropriate code
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error("\n❌ Error:", error instanceof Error ? error.message : "Unknown error");
    if (error instanceof Error && error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
