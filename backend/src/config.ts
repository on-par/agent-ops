import type { FastifyListenOptions } from "fastify";

const DEFAULT_PORT = 3001;
const DEFAULT_HOST = "0.0.0.0";

interface Config {
  port: number;
  host: string;
  anthropicApiKey: string;
  databaseUrl: string;
  isDevelopment: boolean;
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

  return {
    port: parsePort(portString),
    host: getEnvVar("HOST", DEFAULT_HOST),
    anthropicApiKey: getEnvVar("ANTHROPIC_API_KEY", ""),
    databaseUrl: getEnvVar("DATABASE_URL", "sqlite://./agent-ops.db"),
    isDevelopment: getEnvVar("NODE_ENV", "development") === "development",
  };
}

export function getListenOptions(config: Config): FastifyListenOptions {
  return {
    port: config.port,
    host: config.host,
  };
}

export type { Config };
