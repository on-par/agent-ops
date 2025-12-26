import type { FastifyListenOptions } from "fastify";

const DEFAULT_PORT = 3001;
const DEFAULT_HOST = "0.0.0.0";

interface Config {
  port: number;
  host: string;
  anthropicApiKey: string;
  databaseUrl: string;
  isDevelopment: boolean;
  // GitHub OAuth
  githubClientId: string;
  githubClientSecret: string;
  githubCallbackUrl: string;
  githubWebhookSecret: string;
  baseUrl: string;
  // Concurrency limits (em3.5)
  maxGlobalWorkers: number;
  maxWorkersPerRepo: number;
  maxWorkersPerUser: number;
  // Agent Runtime
  workspaceBaseDir: string;
  maxConcurrentAgents: number;
  agentTimeoutMs: number;
  claudeModel: string;
  // LLM Provider Configuration
  llmProvider: "ollama" | "openai" | "anthropic" | "openrouter";
  llmModel: string;
  llmBaseUrl?: string;
  llmApiKey?: string;
}

function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePort(value: string): number {
  const port = parseInt(value, 10);
  if (isNaN(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port number: ${value}`);
  }
  return port;
}

export function loadConfig(): Config {
  const portString = getEnvVar("PORT", String(DEFAULT_PORT));
  const port = parsePort(portString);
  const host = getEnvVar("HOST", DEFAULT_HOST);
  const isDevelopment = getEnvVar("NODE_ENV", "development") === "development";
  const baseUrl = getEnvVar("BASE_URL", `http://localhost:${port}`);

  const llmProvider = getEnvVar("LLM_PROVIDER", "ollama") as "ollama" | "openai" | "anthropic" | "openrouter";

  return {
    port,
    host,
    anthropicApiKey: getEnvVar("ANTHROPIC_API_KEY", ""),
    databaseUrl: getEnvVar("DATABASE_URL", "sqlite://./agent-ops.db"),
    isDevelopment,
    // GitHub OAuth
    githubClientId: getEnvVar("GITHUB_CLIENT_ID", ""),
    githubClientSecret: getEnvVar("GITHUB_CLIENT_SECRET", ""),
    githubCallbackUrl: getEnvVar("GITHUB_CALLBACK_URL", `${baseUrl}/api/auth/github/callback`),
    githubWebhookSecret: getEnvVar("GITHUB_WEBHOOK_SECRET", ""),
    baseUrl,
    // Concurrency limits (em3.5)
    maxGlobalWorkers: parseInt(getEnvVar("MAX_GLOBAL_WORKERS", "10"), 10),
    maxWorkersPerRepo: parseInt(getEnvVar("MAX_WORKERS_PER_REPO", "3"), 10),
    maxWorkersPerUser: parseInt(getEnvVar("MAX_WORKERS_PER_USER", "5"), 10),
    // Agent Runtime
    workspaceBaseDir: getEnvVar("WORKSPACE_BASE_DIR", "/tmp/agent-workspaces"),
    maxConcurrentAgents: parseInt(getEnvVar("MAX_CONCURRENT_AGENTS", "5"), 10),
    agentTimeoutMs: parseInt(getEnvVar("AGENT_TIMEOUT_MS", "600000"), 10), // 10 minutes
    claudeModel: getEnvVar("CLAUDE_MODEL", "claude-sonnet-4-20250514"),
    // LLM Provider Configuration
    llmProvider,
    llmModel: getEnvVar("LLM_MODEL", "qwen2.5-coder:7b"),
    llmBaseUrl: getEnvVar("LLM_BASE_URL", llmProvider === "ollama" ? "http://localhost:11434" : undefined),
    llmApiKey: process.env.LLM_API_KEY,
  };
}

export function getListenOptions(config: Config): FastifyListenOptions {
  return {
    port: config.port,
    host: config.host,
  };
}

export type { Config };
