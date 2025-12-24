import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// Enums stored as text in SQLite
export const workItemTypes = ["feature", "bug", "research", "task"] as const;
export type WorkItemType = (typeof workItemTypes)[number];

export const workItemStatuses = [
  "backlog",
  "ready",
  "in_progress",
  "review",
  "done",
] as const;
export type WorkItemStatus = (typeof workItemStatuses)[number];

export const agentRoles = [
  "refiner",
  "implementer",
  "tester",
  "reviewer",
] as const;
export type AgentRole = (typeof agentRoles)[number];

export const permissionModes = [
  "askUser",
  "acceptEdits",
  "bypassPermissions",
] as const;
export type PermissionMode = (typeof permissionModes)[number];

export const workerStatuses = [
  "idle",
  "working",
  "paused",
  "error",
  "terminated",
] as const;
export type WorkerStatus = (typeof workerStatuses)[number];

export const traceEventTypes = [
  "agent_state",
  "work_item_update",
  "tool_call",
  "metric_update",
  "error",
  "approval_required",
] as const;
export type TraceEventType = (typeof traceEventTypes)[number];

// Work Items table
export const workItems = sqliteTable("work_items", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull().$type<WorkItemType>(),
  status: text("status").notNull().$type<WorkItemStatus>().default("backlog"),

  // GitHub Issue source (optional - for synced issues)
  repositoryId: text("repository_id").references(() => repositories.id),
  githubIssueId: integer("github_issue_id"),
  githubIssueNumber: integer("github_issue_number"),
  githubIssueUrl: text("github_issue_url"),

  // Content
  description: text("description").notNull().default(""),
  successCriteria: text("success_criteria", { mode: "json" })
    .notNull()
    .$type<SuccessCriterion[]>()
    .default([]),
  linkedFiles: text("linked_files", { mode: "json" })
    .notNull()
    .$type<string[]>()
    .default([]),

  // Workflow
  createdBy: text("created_by").notNull(),
  assignedAgents: text("assigned_agents", { mode: "json" })
    .notNull()
    .$type<Record<string, string | undefined>>()
    .default({}),
  requiresApproval: text("requires_approval", { mode: "json" })
    .notNull()
    .$type<Record<string, boolean>>()
    .default({}),

  // Timestamps (stored as Unix milliseconds)
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),

  // Relationships (stored as JSON arrays for SQLite)
  parentId: text("parent_id"),
  childIds: text("child_ids", { mode: "json" })
    .notNull()
    .$type<string[]>()
    .default([]),
  blockedBy: text("blocked_by", { mode: "json" })
    .notNull()
    .$type<string[]>()
    .default([]),
});

// Success criterion type for JSON column
export interface SuccessCriterion {
  id: string;
  description: string;
  completed: boolean;
  verifiedBy?: string;
  verifiedAt?: number; // Unix timestamp
}

// MCP server config type for JSON column
export interface MCPServerConfig {
  name: string;
  type: "stdio" | "sse" | "inprocess";
  command?: string;
  url?: string;
  args: string[];
  env: Record<string, string>;
}

// Agent Templates table
export const templates = sqliteTable("templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdBy: text("created_by").notNull(), // "system" or user_id

  // Claude Agent SDK configuration
  systemPrompt: text("system_prompt").notNull(),
  permissionMode: text("permission_mode")
    .notNull()
    .$type<PermissionMode>()
    .default("askUser"),
  maxTurns: integer("max_turns").notNull().default(100),

  // Tools (stored as JSON)
  builtinTools: text("builtin_tools", { mode: "json" })
    .notNull()
    .$type<string[]>()
    .default([]),
  mcpServers: text("mcp_servers", { mode: "json" })
    .notNull()
    .$type<MCPServerConfig[]>()
    .default([]),

  // Agent Ops metadata
  allowedWorkItemTypes: text("allowed_work_item_types", { mode: "json" })
    .notNull()
    .$type<string[]>()
    .default(["*"]),
  defaultRole: text("default_role").$type<AgentRole>(),

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

// Agent Workers table
export const workers = sqliteTable("workers", {
  id: text("id").primaryKey(),
  templateId: text("template_id")
    .notNull()
    .references(() => templates.id),
  status: text("status").notNull().$type<WorkerStatus>().default("idle"),

  // Current work
  currentWorkItemId: text("current_work_item_id").references(() => workItems.id),
  currentRole: text("current_role").$type<AgentRole>(),

  // SDK state
  sessionId: text("session_id").notNull(),

  // Metrics
  spawnedAt: integer("spawned_at", { mode: "timestamp_ms" }).notNull(),
  contextWindowUsed: integer("context_window_used").notNull().default(0),
  contextWindowLimit: integer("context_window_limit").notNull().default(200000),
  tokensUsed: integer("tokens_used").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  toolCalls: integer("tool_calls").notNull().default(0),
  errors: integer("errors").notNull().default(0),
});

// Traces table for observability
export const traces = sqliteTable("traces", {
  id: text("id").primaryKey(),
  workerId: text("worker_id").references(() => workers.id),
  workItemId: text("work_item_id").references(() => workItems.id),

  // Event details
  eventType: text("event_type").notNull().$type<TraceEventType>(),
  data: text("data", { mode: "json" }).notNull().$type<unknown>().default({}),

  // Timestamp
  timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull(),
});

// Repository sync statuses
export const repoSyncStatuses = [
  "pending",      // Never synced
  "syncing",      // Currently syncing
  "synced",       // Successfully synced
  "error",        // Sync failed
] as const;
export type RepoSyncStatus = (typeof repoSyncStatuses)[number];

// GitHub Connections table - stores OAuth tokens
export const githubConnections = sqliteTable("github_connections", {
  id: text("id").primaryKey(),

  // GitHub user info
  githubUserId: integer("github_user_id").notNull().unique(),
  githubUsername: text("github_username").notNull(),
  githubAvatarUrl: text("github_avatar_url"),

  // OAuth tokens (encrypted in production)
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: integer("token_expires_at", { mode: "timestamp_ms" }),

  // Scopes granted
  scopes: text("scopes", { mode: "json" })
    .notNull()
    .$type<string[]>()
    .default([]),

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

// Connected Repositories table
export const repositories = sqliteTable("repositories", {
  id: text("id").primaryKey(),

  // GitHub connection reference
  connectionId: text("connection_id")
    .notNull()
    .references(() => githubConnections.id, { onDelete: "cascade" }),

  // Repository identification
  githubRepoId: integer("github_repo_id").notNull(),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  fullName: text("full_name").notNull(), // owner/name
  htmlUrl: text("html_url").notNull(),
  description: text("description"),

  // Repository settings
  defaultBranch: text("default_branch").notNull().default("main"),
  isPrivate: integer("is_private", { mode: "boolean" }).notNull().default(false),

  // Sync configuration
  syncEnabled: integer("sync_enabled", { mode: "boolean" }).notNull().default(true),
  syncStatus: text("sync_status").notNull().$type<RepoSyncStatus>().default("pending"),
  syncError: text("sync_error"),
  lastSyncAt: integer("last_sync_at", { mode: "timestamp_ms" }),

  // Issue sync settings
  issueLabelsFilter: text("issue_labels_filter", { mode: "json" })
    .notNull()
    .$type<string[]>()
    .default([]), // Empty = sync all issues
  autoAssignAgents: integer("auto_assign_agents", { mode: "boolean" })
    .notNull()
    .default(false),

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

// Type exports for use in repositories
export type WorkItem = typeof workItems.$inferSelect;
export type NewWorkItem = typeof workItems.$inferInsert;

export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;

export type Worker = typeof workers.$inferSelect;
export type NewWorker = typeof workers.$inferInsert;

export type Trace = typeof traces.$inferSelect;
export type NewTrace = typeof traces.$inferInsert;

export type GitHubConnection = typeof githubConnections.$inferSelect;
export type NewGitHubConnection = typeof githubConnections.$inferInsert;

export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;
