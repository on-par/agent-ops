# Phase 2: Agent Runtime - Research Document

## 1. Problem Overview

### Problem Statement
Build an Agent Runtime system that executes Claude AI agents programmatically against code repositories. The system must handle git operations, agent lifecycle management, workspace isolation, and work product collection. This is the core execution engine for the agent-ops platform.

### Key Objectives
1. **Git Operations Service** - Clone repos, create branches, commit changes, push to remote
2. **Claude SDK Agent Executor** - Run Claude agents programmatically using the Anthropic SDK
3. **Workspace Manager** - Manage temporary workspaces for agent execution with isolation and cleanup
4. **Agent Output Collector** - Capture agent outputs, diffs, logs, and artifacts
5. **Agent Lifecycle Hooks** - Pre/post execution hooks, status callbacks, error handling

### Success Criteria
- Agents can clone repositories and execute against them in isolated workspaces
- All agent outputs (diffs, logs, artifacts) are captured and stored
- Workspaces are automatically cleaned up after execution
- Lifecycle hooks enable extensibility and observability
- Integration with existing workers, traces, and work items tables
- Cost and token usage tracking per execution

---

## 2. Web Research Findings

### Recommended Libraries

#### Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)
The official SDK for programmatic agent execution with built-in workspace management and lifecycle hooks.

**Key Features:**
- Streaming and non-streaming query modes
- 12 hook types: `PreToolUse`, `PostToolUse`, `SessionStart`, `SessionEnd`, `PreCompact`, etc.
- Permission modes: `bypassPermissions` for automated execution
- Token usage and cost tracking built-in
- MCP server support for custom tools
- Session management with resume/fork capabilities

**Basic Usage:**
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Analyze and refactor this codebase",
  options: {
    cwd: "/path/to/workspace",
    model: "claude-sonnet-4-5-20250929",
    maxTurns: 50,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    hooks: {
      PreToolUse: [{ hooks: [preToolHandler] }],
      PostToolUse: [{ hooks: [postToolHandler] }],
      SessionEnd: [{ hooks: [sessionEndHandler] }]
    }
  }
})) {
  if (message.type === 'result') {
    console.log('Cost:', message.total_cost_usd);
  }
}
```

#### Git Operations: `simple-git`
**Recommendation: Use `simple-git`** (7.9M weekly downloads)

| Library | Pros | Cons |
|---------|------|------|
| **simple-git** | Battle-tested, simple API, wraps native git | Requires git binary |
| nodegit | Native bindings | Installation issues, segfaults |
| isomorphic-git | Pure JS, browser support | Slower, less mature |

**Usage Pattern:**
```typescript
import simpleGit, { SimpleGit } from 'simple-git';

const git: SimpleGit = simpleGit(workspacePath);
await git.clone(repoUrl, workspacePath, ['--depth', '1']);
await git.checkoutLocalBranch(branchName);
await git.add('.');
await git.commit(message);
await git.push('origin', branchName, ['--set-upstream']);
```

#### Workspace Management: `tmp-promise`
Uses disposer pattern for automatic cleanup even on errors:

```typescript
import tmp from 'tmp-promise';

const result = await tmp.withDir(
  async ({ path: workspacePath }) => {
    // Operations in workspace
    return await executeAgent(workspacePath);
  },
  { unsafeCleanup: true, prefix: 'agent-workspace-' }
);
// Workspace automatically cleaned up
```

### Best Practices

1. **Shallow Clones**: Use `--depth 1` for faster cloning when full history not needed
2. **Permission Bypass**: Use `permissionMode: 'bypassPermissions'` for automated execution
3. **Hook Validation**: Implement `PreToolUse` hooks to block dangerous operations
4. **Cost Control**: Set `maxBudgetUsd` and `maxTurns` to prevent runaway costs
5. **Streaming**: Use `includePartialMessages: true` for real-time feedback
6. **Session Resume**: Store `session_id` to enable resuming interrupted executions

### Security Considerations
- Use Docker containers for complete isolation in production
- Drop all capabilities except essential ones
- Set memory and CPU limits
- Use network isolation when possible
- Rotate API keys regularly
- Log all tool usage for audit trails

---

## 3. Codebase Analysis

### Project Architecture
- **Framework**: Fastify-based backend
- **Database**: SQLite with Drizzle ORM
- **Pattern**: Service → Repository → Database
- **Testing**: Vitest with in-memory SQLite

### Existing Relevant Models

**Workers Table** (`backend/src/db/schema.ts:160-182`):
```typescript
export const workers = sqliteTable("workers", {
  id: text("id").primaryKey(),
  templateId: text("template_id").references(() => templates.id),
  status: text("status").$type<WorkerStatus>().default("idle"),
  currentWorkItemId: text("current_work_item_id").references(() => workItems.id),
  sessionId: text("session_id").notNull(), // Claude SDK session
  tokensUsed: integer("tokens_used").default(0),
  costUsd: real("cost_usd").default(0),
  toolCalls: integer("tool_calls").default(0),
});
```

**Traces Table** (`backend/src/db/schema.ts:185-196`):
```typescript
export const traces = sqliteTable("traces", {
  id: text("id").primaryKey(),
  workerId: text("worker_id").references(() => workers.id),
  workItemId: text("work_item_id").references(() => workItems.id),
  eventType: text("event_type").$type<TraceEventType>(),
  data: text("data", { mode: "json" }).$type<unknown>(),
  timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull(),
});
```

### Existing Patterns to Follow

**Service Pattern** (`backend/src/services/github-sync.service.ts:27-36`):
```typescript
export class GitHubSyncService {
  private repoRepository: RepositoryRepository;
  private connectionRepo: GitHubConnectionRepository;

  constructor(db: DrizzleDatabase) {
    this.repoRepository = new RepositoryRepository(db);
    this.connectionRepo = new GitHubConnectionRepository(db);
  }
}
```

**Repository Pattern** (`backend/src/repositories/github-connection.repository.ts:10-21`):
```typescript
export class GitHubConnectionRepository {
  constructor(private db: DrizzleDatabase) {}

  async findById(id: string): Promise<GitHubConnection | undefined> {
    const results = await this.db
      .select()
      .from(githubConnections)
      .where(eq(githubConnections.id, id))
      .limit(1);
    return results[0];
  }
}
```

**Route Error Handling** (`backend/src/routes/work-items.routes.ts:77-136`):
```typescript
const handleError = (error: unknown, reply: FastifyReply): void => {
  if (error instanceof ZodError) {
    reply.status(400).send({ error: "Validation failed", details: error.issues });
    return;
  }
  if (error instanceof Error) {
    const message = error.message;
    if (message.includes("not found")) {
      reply.status(404).send({ error: message });
      return;
    }
  }
  throw error;
};
```

### Files to Create

| File | Purpose |
|------|---------|
| `backend/src/services/git-operations.service.ts` | Git clone, branch, commit, push |
| `backend/src/services/workspace-manager.service.ts` | Temp workspace management |
| `backend/src/services/agent-executor.service.ts` | Claude SDK execution |
| `backend/src/services/agent-output-collector.service.ts` | Collect diffs, logs, artifacts |
| `backend/src/services/agent-lifecycle.service.ts` | Pre/post hooks |
| `backend/src/repositories/workspace.repository.ts` | Workspace DB operations |
| `backend/src/repositories/agent-execution.repository.ts` | Execution history |
| `backend/src/routes/agent-runtime.routes.ts` | API endpoints |

### Files to Modify

| File | Changes |
|------|---------|
| `backend/src/db/schema.ts` | Add `workspaces`, `agent_executions` tables |
| `backend/src/config.ts` | Add runtime config options |
| `backend/package.json` | Add `simple-git`, `@anthropic-ai/sdk` |
| `backend/src/app.ts` | Register agent runtime routes |
| `backend/src/services/index.ts` | Export new services |
| `backend/src/repositories/index.ts` | Export new repositories |

---

## 4. Proposed Solution Approach

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Runtime Routes                      │
│  POST /execute  GET /executions/:id  POST /cancel            │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   Agent Executor Service                     │
│  - Orchestrates execution flow                               │
│  - Tracks metrics (tokens, cost, duration)                   │
└────────────────────────┬────────────────────────────────────┘
                         │
     ┌───────────────────┼───────────────────┐
     ▼                   ▼                   ▼
┌─────────────┐  ┌───────────────┐  ┌─────────────────┐
│ Workspace   │  │ Git Operations │  │ Output Collector │
│ Manager     │  │ Service        │  │ Service          │
│             │  │                │  │                  │
│ - Create    │  │ - Clone        │  │ - Diffs          │
│ - Cleanup   │  │ - Branch       │  │ - Logs           │
│ - Isolate   │  │ - Commit/Push  │  │ - Artifacts      │
└─────────────┘  └────────────────┘  └──────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                 Agent Lifecycle Service                      │
│  - PreExecution hooks (workspace setup, clone)               │
│  - PostExecution hooks (collect output, PR creation)         │
│  - Error hooks (cleanup, notifications)                      │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Order

1. **Database Schema** - Add tables first (foundational)
2. **Dependencies** - Install `simple-git`, `@anthropic-ai/sdk`
3. **Repositories** - WorkspaceRepository, AgentExecutionRepository
4. **Core Services** (in order):
   - WorkspaceManager (temp directories)
   - GitOperations (git commands)
   - AgentOutputCollector (results)
   - AgentLifecycle (hooks)
   - AgentExecutor (orchestration)
5. **Routes** - API endpoints
6. **Integration** - Register in app.ts

### Technology Choices

| Component | Choice | Justification |
|-----------|--------|---------------|
| Agent SDK | `@anthropic-ai/claude-agent-sdk` | Official SDK with hooks |
| Git | `simple-git` | Most popular, reliable, async API |
| Temp dirs | `tmp-promise` | Disposer pattern, auto-cleanup |
| Streaming | Node.js EventEmitter | Built-in, no dependencies |

### Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Disk space exhaustion | Cleanup TTL, workspace limits |
| Runaway costs | `maxBudgetUsd`, `maxTurns` limits |
| Token expiry | Refresh GitHub tokens proactively |
| Git failures | Retry logic with exponential backoff |
| Security | Path validation, workspace isolation |

---

## 5. Example Code Snippets

### New Database Schema

```typescript
// backend/src/db/schema.ts - Add these tables

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
```

### Git Operations Service

```typescript
// backend/src/services/git-operations.service.ts

import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';

export class GitOperationsService {
  private git: SimpleGit;

  constructor(private workspacePath: string) {
    const options: Partial<SimpleGitOptions> = {
      baseDir: workspacePath,
      binary: 'git',
      maxConcurrentProcesses: 6,
    };
    this.git = simpleGit(options);
  }

  async cloneRepository(repoUrl: string, branch?: string): Promise<void> {
    const cloneOptions = ['--depth', '1'];
    if (branch) cloneOptions.push('--branch', branch);

    await simpleGit().clone(repoUrl, this.workspacePath, cloneOptions);
    this.git = simpleGit(this.workspacePath);
  }

  async createBranch(branchName: string): Promise<void> {
    await this.git.checkoutLocalBranch(branchName);
  }

  async commitChanges(message: string): Promise<void> {
    await this.git.add('.');
    await this.git.commit(message);
  }

  async pushChanges(remote = 'origin', branch?: string): Promise<void> {
    const currentBranch = branch || (await this.git.branch()).current;
    await this.git.push(remote, currentBranch, ['--set-upstream']);
  }

  async getDiff(): Promise<string> {
    return await this.git.diff();
  }

  async getStatus() {
    return await this.git.status();
  }

  async configureUser(name: string, email: string): Promise<void> {
    await this.git.addConfig('user.name', name);
    await this.git.addConfig('user.email', email);
  }
}
```

### Agent Executor Service

```typescript
// backend/src/services/agent-executor.service.ts

import { query, Options } from '@anthropic-ai/claude-agent-sdk';
import { EventEmitter } from 'events';
import { WorkspaceManager } from './workspace-manager.service.js';
import { GitOperationsService } from './git-operations.service.js';
import { AgentExecutionRepository } from '../repositories/agent-execution.repository.js';

export interface ExecutionResult {
  sessionId: string;
  result: string;
  diff: string;
  logs: string[];
  cost: number;
  duration: number;
  tokensUsed: number;
  toolCalls: number;
}

export class AgentExecutorService extends EventEmitter {
  constructor(
    private workspaceManager: WorkspaceManager,
    private executionRepo: AgentExecutionRepository,
    private config: { apiKey: string; model: string; maxTurns: number }
  ) {
    super();
  }

  async execute(
    repoUrl: string,
    prompt: string,
    options: { branch?: string; workItemId?: string; workerId?: string } = {}
  ): Promise<ExecutionResult> {
    const logs: string[] = [];
    const startTime = Date.now();

    return this.workspaceManager.executeInWorkspace(async (workspacePath) => {
      // Clone repository
      const git = new GitOperationsService(workspacePath);
      await git.cloneRepository(repoUrl, options.branch);
      await git.configureUser('Agent Runtime', 'agent@runtime.local');

      // Create working branch
      const branchName = `agent/${Date.now()}`;
      await git.createBranch(branchName);
      this.emit('branch-created', branchName);

      // Execute agent with hooks
      let lastResult: any;
      const agentOptions: Options = {
        cwd: workspacePath,
        model: this.config.model,
        maxTurns: this.config.maxTurns,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        hooks: {
          PreToolUse: [{
            hooks: [async (input) => {
              logs.push(`[PRE] ${(input as any).tool_name}`);
              this.emit('tool-use', input);
              return {};
            }]
          }],
          PostToolUse: [{
            hooks: [async (input) => {
              logs.push(`[POST] ${(input as any).tool_name}`);
              return {};
            }]
          }]
        }
      };

      for await (const message of query({ prompt, options: agentOptions })) {
        if (message.type === 'result') {
          lastResult = message;
        }
      }

      // Collect output
      const diff = await git.getDiff();
      const duration = Date.now() - startTime;

      return {
        sessionId: lastResult.session_id,
        result: lastResult.result,
        diff,
        logs,
        cost: lastResult.total_cost_usd,
        duration,
        tokensUsed: lastResult.total_tokens || 0,
        toolCalls: logs.filter(l => l.startsWith('[PRE]')).length,
      };
    });
  }
}
```

### Configuration Updates

```typescript
// backend/src/config.ts - Add these fields

interface Config {
  // ... existing fields ...

  // Agent Runtime
  workspaceBaseDir: string;
  workspaceCleanupTtlMs: number;
  maxConcurrentExecutions: number;
  executionTimeoutMs: number;
  claudeModel: string;
  anthropicApiKey: string;
}

export const config: Config = {
  // ... existing config ...

  workspaceBaseDir: process.env.WORKSPACE_BASE_DIR || '/tmp/agent-workspaces',
  workspaceCleanupTtlMs: parseInt(process.env.WORKSPACE_CLEANUP_TTL_MS || '3600000'), // 1 hour
  maxConcurrentExecutions: parseInt(process.env.MAX_CONCURRENT_EXECUTIONS || '5'),
  executionTimeoutMs: parseInt(process.env.EXECUTION_TIMEOUT_MS || '600000'), // 10 min
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
};
```

---

## 6. Next Steps

### Prerequisites
1. Install dependencies: `npm install simple-git @anthropic-ai/sdk tmp-promise`
2. Set environment variable: `ANTHROPIC_API_KEY`
3. Ensure git is installed on the system

### Implementation Order

| Phase | Tasks | Issue |
|-------|-------|-------|
| 1 | Add database schema, create migration | agent-ops-c8a.3 (Workspace Manager) |
| 2 | Implement GitOperationsService with tests | agent-ops-c8a.1 |
| 3 | Implement WorkspaceManager with tests | agent-ops-c8a.3 |
| 4 | Implement AgentOutputCollector with tests | agent-ops-c8a.4 |
| 5 | Implement AgentExecutor with tests | agent-ops-c8a.2 |
| 6 | Implement AgentLifecycle hooks | agent-ops-c8a.5 |
| 7 | Create API routes and integration tests | - |

### Testing Considerations
- Use in-memory SQLite for unit tests (existing pattern)
- Mock `simple-git` for git operation tests
- Mock Claude SDK for executor tests
- Create test repository for integration tests
- Test cleanup on error scenarios
- Test concurrent execution limits

### Observability
- Emit trace events for all lifecycle stages
- Track token usage and costs per execution
- Log all tool calls for debugging
- Store execution history for audit

---

## Sources

### Web Research
- [Claude Agent SDK TypeScript GitHub](https://github.com/anthropics/claude-agent-sdk-typescript)
- [Building agents with Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
- [Agent SDK Hooks Documentation](https://platform.claude.com/docs/en/agent-sdk/hooks)
- [simple-git npm package](https://www.npmjs.com/package/simple-git)
- [tmp-promise GitHub](https://github.com/benjamingr/tmp-promise)
- [Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

### Codebase References
- `backend/src/db/schema.ts` - Database schema (workers: 160-182, traces: 185-196)
- `backend/src/services/github-sync.service.ts` - Service pattern (27-36)
- `backend/src/repositories/github-connection.repository.ts` - Repository pattern (10-21)
- `backend/src/routes/work-items.routes.ts` - Route error handling (77-136)
- `backend/src/routes/work-items.routes.test.ts` - Test patterns (16-91)
- `backend/src/config.ts` - Configuration pattern
