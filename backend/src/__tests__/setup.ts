import { afterEach, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { v4 as uuidv4 } from "uuid";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import * as schema from "../db/schema.js";
import { buildApp } from "../app.js";

export type TestDatabase = BetterSQLite3Database<typeof schema>;

let testDb: TestDatabase | null = null;
let testSqlite: Database.Database | null = null;
let testApp: FastifyInstance | null = null;

/**
 * Creates an in-memory SQLite database for testing
 */
export function createTestDatabase(): {
  db: TestDatabase;
  sqlite: Database.Database;
} {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  // Create tables manually since we're using in-memory DB
  // In a real app, you'd run migrations, but for tests we can create tables directly
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS work_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'backlog',
      description TEXT NOT NULL DEFAULT '',
      success_criteria TEXT NOT NULL DEFAULT '[]',
      linked_files TEXT NOT NULL DEFAULT '[]',
      created_by TEXT NOT NULL,
      assigned_agents TEXT NOT NULL DEFAULT '{}',
      requires_approval TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER,
      parent_id TEXT,
      child_ids TEXT NOT NULL DEFAULT '[]',
      blocked_by TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      permission_mode TEXT NOT NULL DEFAULT 'askUser',
      max_turns INTEGER NOT NULL DEFAULT 100,
      builtin_tools TEXT NOT NULL DEFAULT '[]',
      mcp_servers TEXT NOT NULL DEFAULT '[]',
      allowed_work_item_types TEXT NOT NULL DEFAULT '["*"]',
      default_role TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workers (
      id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      current_work_item_id TEXT,
      current_role TEXT,
      session_id TEXT NOT NULL,
      spawned_at INTEGER NOT NULL,
      context_window_used INTEGER NOT NULL DEFAULT 0,
      context_window_limit INTEGER NOT NULL DEFAULT 200000,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      tool_calls INTEGER NOT NULL DEFAULT 0,
      errors INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (template_id) REFERENCES templates(id),
      FOREIGN KEY (current_work_item_id) REFERENCES work_items(id)
    );

    CREATE TABLE IF NOT EXISTS traces (
      id TEXT PRIMARY KEY,
      worker_id TEXT,
      work_item_id TEXT,
      event_type TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (worker_id) REFERENCES workers(id),
      FOREIGN KEY (work_item_id) REFERENCES work_items(id)
    );
  `);

  return { db, sqlite };
}

/**
 * Sets up a fresh test database before each test
 */
export function setupTestDatabase() {
  beforeEach(() => {
    const { db, sqlite } = createTestDatabase();
    testDb = db;
    testSqlite = sqlite;
  });

  afterEach(() => {
    if (testSqlite) {
      testSqlite.close();
      testSqlite = null;
    }
    testDb = null;
  });
}

/**
 * Gets the current test database instance
 */
export function getTestDatabase(): TestDatabase {
  if (!testDb) {
    throw new Error("Test database not initialized. Did you call setupTestDatabase()?");
  }
  return testDb;
}

/**
 * Clears all data from the test database
 */
export async function clearTestDatabase() {
  const db = getTestDatabase();
  await db.delete(schema.traces);
  await db.delete(schema.workers);
  await db.delete(schema.workItems);
  await db.delete(schema.templates);
}

/**
 * Sets up a test Fastify application
 */
export async function setupTestApp() {
  beforeEach(async () => {
    testApp = await buildApp({
      config: {
        port: 0, // Use random port for tests
        host: "127.0.0.1",
        anthropicApiKey: "test-key",
        databaseUrl: ":memory:",
        isDevelopment: true,
      },
    });
  });

  afterEach(async () => {
    if (testApp) {
      await testApp.close();
      testApp = null;
    }
  });
}

/**
 * Gets the current test app instance
 */
export function getTestApp(): FastifyInstance {
  if (!testApp) {
    throw new Error("Test app not initialized. Did you call setupTestApp()?");
  }
  return testApp;
}

// ========================================
// Test Fixtures
// ========================================

export const testFixtures = {
  /**
   * Creates a test work item
   */
  workItem: (overrides?: Partial<schema.NewWorkItem>): schema.NewWorkItem => {
    const now = new Date();
    return {
      id: uuidv4(),
      title: "Test Work Item",
      type: "feature",
      status: "backlog",
      description: "A test work item for unit tests",
      successCriteria: [
        {
          id: uuidv4(),
          description: "Test criterion",
          completed: false,
        },
      ],
      linkedFiles: [],
      createdBy: "test-user",
      assignedAgents: {},
      requiresApproval: {},
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
      parentId: null,
      childIds: [],
      blockedBy: [],
      ...overrides,
    };
  },

  /**
   * Creates a test template
   */
  template: (overrides?: Partial<schema.NewTemplate>): schema.NewTemplate => {
    const now = new Date();
    return {
      id: uuidv4(),
      name: "Test Template",
      description: "A test agent template",
      createdBy: "system",
      systemPrompt: "You are a test agent.",
      permissionMode: "askUser",
      maxTurns: 100,
      builtinTools: ["read", "write", "bash"],
      mcpServers: [],
      allowedWorkItemTypes: ["*"],
      defaultRole: "implementer",
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  },

  /**
   * Creates a test worker
   */
  worker: (
    templateId: string,
    overrides?: Partial<schema.NewWorker>
  ): schema.NewWorker => {
    const now = new Date();
    return {
      id: uuidv4(),
      templateId,
      status: "idle",
      currentWorkItemId: null,
      currentRole: null,
      sessionId: uuidv4(),
      spawnedAt: now,
      contextWindowUsed: 0,
      contextWindowLimit: 200000,
      tokensUsed: 0,
      costUsd: 0,
      toolCalls: 0,
      errors: 0,
      ...overrides,
    };
  },

  /**
   * Creates a test trace event
   */
  trace: (overrides?: Partial<schema.NewTrace>): schema.NewTrace => {
    return {
      id: uuidv4(),
      workerId: null,
      workItemId: null,
      eventType: "agent_state",
      data: {},
      timestamp: new Date(),
      ...overrides,
    };
  },

  /**
   * Creates a success criterion
   */
  successCriterion: (
    overrides?: Partial<schema.SuccessCriterion>
  ): schema.SuccessCriterion => {
    return {
      id: uuidv4(),
      description: "Test success criterion",
      completed: false,
      ...overrides,
    };
  },

  /**
   * Creates an MCP server config
   */
  mcpServer: (overrides?: Partial<schema.MCPServerConfig>): schema.MCPServerConfig => {
    return {
      name: "test-server",
      type: "stdio",
      command: "node",
      args: ["server.js"],
      env: {},
      ...overrides,
    };
  },
};

// ========================================
// Test Helpers
// ========================================

/**
 * Seeds the database with test data
 */
export async function seedDatabase(db: TestDatabase) {
  // Create a template
  const template = testFixtures.template({
    id: "template-1",
    name: "Implementer Template",
    defaultRole: "implementer",
  });
  await db.insert(schema.templates).values(template);

  // Create some work items
  const workItem1 = testFixtures.workItem({
    id: "work-item-1",
    title: "Implement feature A",
    type: "feature",
    status: "backlog",
  });
  const workItem2 = testFixtures.workItem({
    id: "work-item-2",
    title: "Fix bug B",
    type: "bug",
    status: "ready",
  });
  const workItem3 = testFixtures.workItem({
    id: "work-item-3",
    title: "Research topic C",
    type: "research",
    status: "in_progress",
  });

  await db.insert(schema.workItems).values([workItem1, workItem2, workItem3]);

  // Create a worker
  const worker = testFixtures.worker("template-1", {
    id: "worker-1",
    status: "working",
    currentWorkItemId: "work-item-3",
    currentRole: "implementer",
  });
  await db.insert(schema.workers).values(worker);

  return { template, workItems: [workItem1, workItem2, workItem3], worker };
}

/**
 * Waits for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error("Timeout waiting for condition");
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
