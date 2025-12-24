# Phase 2: Agent Runtime - Implementation Plan

## Problem Summary

Build an Agent Runtime system that executes Claude AI agents programmatically against code repositories, including git operations, workspace management, Claude SDK integration, output collection, and lifecycle hooks.

**Research Document**: [research.md](./research.md)

## Prerequisites

- [x] Install dependencies: `cd backend && npm install simple-git tmp-promise @anthropic-ai/sdk`
- [x] Set environment variable: `ANTHROPIC_API_KEY`
- [x] Ensure git CLI is installed on system

**Beads Issues**:
- agent-ops-c8a: Phase 2: Agent Runtime (epic)
- agent-ops-c8a.1: Git operations service
- agent-ops-c8a.2: Claude SDK agent executor
- agent-ops-c8a.3: Workspace manager
- agent-ops-c8a.4: Agent output collector
- agent-ops-c8a.5: Agent lifecycle hooks

---

## Phase 1: Database Schema and Configuration

**Goal:** Add new database tables for workspaces and agent executions, plus runtime configuration.

**Context:**
- Schema file: `backend/src/db/schema.ts`
- Config file: `backend/src/config.ts`
- See Appendix A for schema definitions

**Tasks:**

- [x] 🟢 Add `workspaces` table to schema.ts (see Appendix A)
- [x] 🟢 Add `agentExecutions` table to schema.ts (see Appendix A)
- [x] 🟢 Export types: `Workspace`, `NewWorkspace`, `AgentExecution`, `NewAgentExecution`
- [x] 🟢 Add `AgentExecutionOutput` interface for JSON output column
- [x] 🟢 Add agent runtime config to `config.ts`: `workspaceBaseDir`, `maxConcurrentAgents`, `agentTimeoutMs`, `claudeModel`, `anthropicApiKey`
- [x] 🟢 Run `npm run db:generate` to create migration
- [x] 🟢 Verify existing tests pass: `npm test`

---

## Phase 2: Workspace Repository and Manager Service

**Goal:** Implement workspace management for temporary directory creation, isolation, and cleanup.

**Context:**
- Repository pattern: `backend/src/repositories/github-connection.repository.ts`
- Service pattern: `backend/src/services/github-sync.service.ts`
- Uses `tmp-promise` for temp directory management

**Beads Issue:** agent-ops-c8a.3 (Workspace manager)

### 2.1 Workspace Repository

- [x] 🔴 Write test for `findById` returns undefined for non-existent workspace (expect fail)
- [x] 🔴 Write test for `create` inserts workspace and returns it (expect fail)
- [x] 🔴 Write test for `findByWorkerId` returns workspaces for a worker (expect fail)
- [x] 🔴 Write test for `findByStatus` filters by status (expect fail)
- [x] 🔴 Write test for `updateStatus` changes status and sets timestamps (expect fail)
- [x] 🔴 Write test for `delete` removes workspace record (expect fail)
- [x] 🟢 Create `workspace.repository.ts` with class skeleton (expect pass)
- [x] 🟢 Implement `findById(id: string)` (expect pass)
- [x] 🟢 Implement `create(data: NewWorkspace)` (expect pass)
- [x] 🟢 Implement `findByWorkerId(workerId: string)` (expect pass)
- [x] 🟢 Implement `findByStatus(status: WorkspaceStatus)` (expect pass)
- [x] 🟢 Implement `updateStatus(id: string, status: WorkspaceStatus)` (expect pass)
- [x] 🟢 Implement `delete(id: string)` (expect pass)
- [x] 🔵 Refactor repository if needed (keep passing)
- [x] 🟢 Export from `repositories/index.ts`

### 2.2 Workspace Manager Service

- [x] 🔴 Write test for `createWorkspace` creates temp dir and DB record (expect fail)
- [x] 🔴 Write test for `createWorkspace` sets status to "active" (expect fail)
- [x] 🔴 Write test for `getWorkspace` returns workspace by id (expect fail)
- [x] 🔴 Write test for `getWorkspacePath` returns filesystem path (expect fail)
- [x] 🔴 Write test for `cleanupWorkspace` removes dir and sets status (expect fail)
- [x] 🔴 Write test for `listActiveWorkspaces` returns only active (expect fail)
- [x] 🔴 Write test for `cleanupStaleWorkspaces` cleans old workspaces (expect fail)
- [x] 🟢 Create `workspace-manager.service.ts` with constructor (expect pass)
- [x] 🟢 Implement `createWorkspace(workerId, workItemId, repositoryId)` (expect pass)
- [x] 🟢 Implement `getWorkspace(id: string)` (expect pass)
- [x] 🟢 Implement `getWorkspacePath(id: string)` (expect pass)
- [x] 🟢 Implement `cleanupWorkspace(id: string)` (expect pass)
- [x] 🟢 Implement `listActiveWorkspaces()` (expect pass)
- [x] 🟢 Implement `cleanupStaleWorkspaces(maxAgeMs: number)` (expect pass)
- [x] 🔵 Refactor service if needed (keep passing)
- [x] 🟢 Export from `services/index.ts`

---

## Phase 3: Git Operations Service

**Goal:** Implement git operations using simple-git for clone, branch, commit, and push.

**Context:**
- Uses `simple-git` library
- See Appendix B for GitOperationsService pattern

**Beads Issue:** agent-ops-c8a.1 (Git operations service)

- [x] 🔴 Write test for `cloneRepository` clones repo to path (expect fail)
- [x] 🔴 Write test for `cloneRepository` uses auth token for private repos (expect fail)
- [x] 🔴 Write test for `cloneRepository` throws on failure (expect fail)
- [x] 🔴 Write test for `createBranch` creates and checkouts branch (expect fail)
- [x] 🔴 Write test for `getCurrentBranch` returns branch name (expect fail)
- [x] 🔴 Write test for `stageAllChanges` adds all files (expect fail)
- [x] 🔴 Write test for `commit` creates commit with message (expect fail)
- [x] 🔴 Write test for `push` pushes to remote (expect fail)
- [x] 🔴 Write test for `getDiff` returns diff of changes (expect fail)
- [x] 🔴 Write test for `getStatus` returns git status summary (expect fail)
- [x] 🟢 Create `git-operations.service.ts` with interfaces (expect pass)
- [x] 🟢 Implement constructor with config (expect pass)
- [x] 🟢 Implement `cloneRepository(options: GitCloneOptions)` (expect pass)
- [x] 🟢 Implement `createBranch(repoPath, branchName)` (expect pass)
- [x] 🟢 Implement `getCurrentBranch(repoPath)` (expect pass)
- [x] 🟢 Implement `stageAllChanges(repoPath)` (expect pass)
- [x] 🟢 Implement `commit(repoPath, options: GitCommitOptions)` (expect pass)
- [x] 🟢 Implement `push(repoPath, branchName, token?)` (expect pass)
- [x] 🟢 Implement `getDiff(repoPath)` (expect pass)
- [x] 🟢 Implement `getStatus(repoPath)` (expect pass)
- [x] 🔵 Refactor service if needed (keep passing)
- [x] 🟢 Export from `services/index.ts`

---

## Phase 4: Agent Executor and Output Collector

**Goal:** Implement Claude SDK integration and output collection.

**Context:**
- Uses `@anthropic-ai/claude-agent-sdk`
- Depends on WorkspaceManager and GitOperations
- See Appendix C for executor pattern

**Beads Issues:** agent-ops-c8a.2 (Executor), agent-ops-c8a.4 (Output collector)

### 4.1 Agent Execution Repository

- [x] 🔴 Write test for `create` inserts execution with pending status (expect fail)
- [x] 🔴 Write test for `findById` returns execution (expect fail)
- [x] 🔴 Write test for `findByWorkerId` returns executions for worker (expect fail)
- [x] 🔴 Write test for `findByWorkItemId` returns executions for work item (expect fail)
- [x] 🔴 Write test for `updateStatus` changes status with timestamps (expect fail)
- [x] 🔴 Write test for `setOutput` stores JSON output (expect fail)
- [x] 🔴 Write test for `updateMetrics` updates tokens/cost/toolCalls (expect fail)
- [x] 🟢 Create `agent-execution.repository.ts` (expect pass)
- [x] 🟢 Implement all repository methods (expect pass)
- [x] 🔵 Refactor repository if needed (keep passing)
- [x] 🟢 Export from `repositories/index.ts`

### 4.2 Agent Output Collector Service

- [x] 🔴 Write test for `collectDiff` captures git diff (expect fail)
- [x] 🔴 Write test for `collectLogs` aggregates log entries (expect fail)
- [x] 🔴 Write test for `collectArtifacts` lists modified files (expect fail)
- [x] 🔴 Write test for `collectMetrics` aggregates token/cost data (expect fail)
- [x] 🔴 Write test for `saveOutput` persists to execution record (expect fail)
- [x] 🟢 Create `agent-output-collector.service.ts` (expect pass)
- [x] 🟢 Implement `collectDiff(workspacePath)` (expect pass)
- [x] 🟢 Implement `collectLogs(executionId)` (expect pass)
- [x] 🟢 Implement `collectArtifacts(workspacePath)` (expect pass)
- [x] 🟢 Implement `collectMetrics(executionId)` (expect pass)
- [x] 🟢 Implement `saveOutput(executionId, output)` (expect pass)
- [x] 🔵 Refactor service if needed (keep passing)
- [x] 🟢 Export from `services/index.ts`

### 4.3 Agent Executor Service

- [x] 🔴 Write test for `execute` creates execution record (expect fail)
- [x] 🔴 Write test for `execute` runs agent in workspace dir (expect fail)
- [x] 🔴 Write test for `execute` updates status to running (expect fail)
- [x] 🔴 Write test for `execute` collects output on completion (expect fail)
- [x] 🔴 Write test for `execute` handles errors with error status (expect fail)
- [x] 🔴 Write test for `execute` respects timeout config (expect fail)
- [x] 🔴 Write test for `cancel` stops running execution (expect fail)
- [x] 🟢 Create `agent-executor.service.ts` with interfaces (expect pass)
- [x] 🟢 Implement constructor with dependencies (expect pass)
- [x] 🟢 Implement `execute(context: ExecutionContext)` (expect pass)
- [x] 🟢 Implement `cancel(executionId: string)` (expect pass)
- [x] 🔵 Refactor service if needed (keep passing)
- [x] 🟢 Export from `services/index.ts`

---

## Phase 5: Lifecycle Hooks and API Routes

**Goal:** Implement lifecycle hooks and HTTP endpoints.

**Context:**
- Route pattern: `backend/src/routes/work-items.routes.ts`
- Error handling: `backend/src/routes/work-items.routes.ts:77-136`

**Beads Issue:** agent-ops-c8a.5 (Lifecycle hooks)

### 5.1 Agent Lifecycle Service

- [x] 🔴 Write test for `registerPreExecutionHook` stores callback (expect fail)
- [x] 🔴 Write test for `registerPostExecutionHook` stores callback (expect fail)
- [x] 🔴 Write test for `registerErrorHook` stores callback (expect fail)
- [x] 🔴 Write test for `runPreExecutionHooks` calls all hooks (expect fail)
- [x] 🔴 Write test for `runPreExecutionHooks` aborts if hook returns false (expect fail)
- [x] 🔴 Write test for `runPostExecutionHooks` calls hooks with result (expect fail)
- [x] 🔴 Write test for `runErrorHooks` calls hooks with error (expect fail)
- [x] 🔴 Write test for `unregisterHook` removes hook by id (expect fail)
- [x] 🟢 Create `agent-lifecycle.service.ts` with types (expect pass)
- [x] 🟢 Implement hook registration methods (expect pass)
- [x] 🟢 Implement `runPreExecutionHooks(context)` (expect pass)
- [x] 🟢 Implement `runPostExecutionHooks(context, result)` (expect pass)
- [x] 🟢 Implement `runErrorHooks(context, error)` (expect pass)
- [x] 🟢 Implement `unregisterHook(type, id)` (expect pass)
- [x] 🔵 Refactor service if needed (keep passing)
- [x] 🟢 Export from `services/index.ts`

### 5.2 Agent Runtime Routes

- [x] 🔴 Write test for `POST /execute` starts execution (expect fail)
- [x] 🔴 Write test for `POST /execute` returns 400 for missing workerId (expect fail)
- [x] 🔴 Write test for `POST /execute` returns 404 for non-existent worker (expect fail)
- [x] 🔴 Write test for `GET /executions/:id` returns details (expect fail)
- [x] 🔴 Write test for `GET /executions/:id` returns 404 for not found (expect fail)
- [x] 🔴 Write test for `POST /executions/:id/cancel` cancels execution (expect fail)
- [x] 🔴 Write test for `GET /workspaces` lists active workspaces (expect fail)
- [x] 🔴 Write test for `DELETE /workspaces/:id` cleans up workspace (expect fail)
- [x] 🟢 Create `agent-runtime.routes.ts` with plugin structure (expect pass)
- [x] 🟢 Add Zod schemas for request validation (expect pass)
- [x] 🟢 Implement `POST /execute` route (expect pass)
- [x] 🟢 Implement `GET /executions/:id` route (expect pass)
- [x] 🟢 Implement `POST /executions/:id/cancel` route (expect pass)
- [x] 🟢 Implement `GET /workspaces` route (expect pass)
- [x] 🟢 Implement `DELETE /workspaces/:id` route (expect pass)
- [x] 🔵 Refactor routes if needed (keep passing)

### 5.3 Integration

- [x] 🟢 Import and register routes in `app.ts` with prefix `/api/agent-runtime`
- [x] 🟢 Run all tests: `npm test`
- [x] 🟢 Run linter: `npm run lint`
- [x] 🟢 Run build: `npm run build`

---

## Appendix: Code Examples

### Appendix A: Database Schema

```typescript
// backend/src/db/schema.ts

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  workerId: text("worker_id").references(() => workers.id),
  workItemId: text("work_item_id").references(() => workItems.id),
  repositoryId: text("repository_id").references(() => repositories.id),
  path: text("path").notNull(),
  branchName: text("branch_name"),
  status: text("status").$type<"active" | "completed" | "error" | "cleaning">(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  cleanupAt: integer("cleanup_at", { mode: "timestamp_ms" }),
});

export const agentExecutions = sqliteTable("agent_executions", {
  id: text("id").primaryKey(),
  workerId: text("worker_id").references(() => workers.id),
  workItemId: text("work_item_id").references(() => workItems.id),
  workspaceId: text("workspace_id").references(() => workspaces.id),
  templateId: text("template_id").references(() => templates.id),
  status: text("status").$type<"pending" | "running" | "success" | "error" | "cancelled">(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  durationMs: integer("duration_ms"),
  tokensUsed: integer("tokens_used").default(0),
  costUsd: real("cost_usd").default(0),
  toolCallsCount: integer("tool_calls_count").default(0),
  errorMessage: text("error_message"),
  output: text("output", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type AgentExecution = typeof agentExecutions.$inferSelect;
export type NewAgentExecution = typeof agentExecutions.$inferInsert;
```

### Appendix B: Git Operations Pattern

```typescript
// backend/src/services/git-operations.service.ts

import simpleGit, { SimpleGit } from 'simple-git';

export interface GitCloneOptions {
  url: string;
  path: string;
  token?: string;
  branch?: string;
}

export class GitOperationsService {
  async cloneRepository(options: GitCloneOptions): Promise<void> {
    const cloneOptions = ['--depth', '1'];
    if (options.branch) cloneOptions.push('--branch', options.branch);

    const url = options.token
      ? options.url.replace('https://', `https://${options.token}@`)
      : options.url;

    await simpleGit().clone(url, options.path, cloneOptions);
  }
}
```

### Appendix C: Agent Executor Pattern

```typescript
// backend/src/services/agent-executor.service.ts

import { query } from '@anthropic-ai/claude-agent-sdk';

export interface ExecutionContext {
  workerId: string;
  workItemId: string;
  workspaceId: string;
  templateId: string;
  workspacePath: string;
}

export class AgentExecutorService {
  async execute(context: ExecutionContext): Promise<ExecutionResult> {
    for await (const message of query({
      prompt: template.systemPrompt,
      options: {
        cwd: context.workspacePath,
        model: this.config.claudeModel,
        maxTurns: 50,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      }
    })) {
      if (message.type === 'result') {
        return this.buildResult(message);
      }
    }
  }
}
```

### Appendix D: Repository Pattern

See `backend/src/repositories/github-connection.repository.ts:10-21` for Drizzle repository pattern.

### Appendix E: Route Pattern

See `backend/src/routes/work-items.routes.ts:77-136` for Fastify route error handling pattern.
