import Database, { type Database as SQLiteDatabase } from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export interface DatabaseConfig {
  url: string;
}

export interface DatabaseConnection {
  db: BetterSQLite3Database<typeof schema>;
  sqlite: SQLiteDatabase;
}

const DEFAULT_DB_PATH = "./agent-ops.db";

function parseDatabaseUrl(url: string): string {
  // Support sqlite:// protocol or just a file path
  if (url.startsWith("sqlite://")) {
    return url.slice("sqlite://".length);
  }
  return url;
}

export function createDatabase(config: DatabaseConfig): DatabaseConnection {
  const dbPath = parseDatabaseUrl(config.url) || DEFAULT_DB_PATH;
  const sqlite = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  sqlite.pragma("journal_mode = WAL");

  // Enable foreign keys
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  return { db, sqlite };
}

export type DrizzleDatabase = ReturnType<typeof createDatabase>["db"];

// Re-export schema for convenience
export * from "./schema.js";
