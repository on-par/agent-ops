# Agent Ops: Design Document v4

## Executive Summary

Agent Ops is an autonomous work queue platform where AI agents pick up, execute, and complete work items from a Kanban board. It combines project management with AI-powered execution, featuring real-time observability, configurable human approval gates, and a flexible agent template system built on the Claude Agent SDK.

---

## Core Concept

```
┌─────────────────────────────────────────────────────────────────┐
│                         KANBAN BOARD                             │
│   Backlog  →  Ready  →  In Progress  →  Review  →  Done         │
└──────┬──────────┬─────────────┬────────────┬──────────┬─────────┘
       │          │             │            │          │
       │     Human/Auto    Agent pulls   Agent        Human/Auto
       │     approves      work item     completes    approves
       │     criteria                    work
       │          │             │            │          │
       ▼          ▼             ▼            ▼          ▼
   ┌────────┐ ┌────────┐  ┌──────────┐  ┌────────┐ ┌────────┐
   │Refiner │ │        │  │Implementer│  │ Tester │ │Reviewer│
   │ Agent  │ │        │  │  Agent   │  │ Agent  │ │ Agent  │
   └────────┘ └────────┘  └──────────┘  └────────┘ └────────┘
       │                        │
       └────────────────────────┘
              Can create new
              backlog items
```

---

## Development Principles

### SOLID Principles
- **Single Responsibility:** Each module/class has one reason to change
- **Open/Closed:** Open for extension, closed for modification
- **Liskov Substitution:** Subtypes must be substitutable for base types
- **Interface Segregation:** Many specific interfaces over one general-purpose
- **Dependency Inversion:** Depend on abstractions, not concretions

### Clean Code Standards
- Meaningful, intention-revealing names
- Small, focused functions (< 20 lines preferred)
- No magic numbers or strings—use constants
- Comments explain "why," not "what"
- Consistent formatting (enforced via ESLint/Prettier)

### DRY (Don't Repeat Yourself)
- Extract shared logic into utilities
- Use generics and type factories for similar patterns
- Single source of truth for configuration

### Pragmatic Programmer
- Tracer bullets: Get end-to-end working first, then refine
- Orthogonality: Minimize coupling between components
- Reversibility: Design for easy changes
- Good enough software: Ship iteratively

### Test-Driven Development (TDD)
- Red-Green-Refactor cycle
- Write tests before implementation
- Tests serve as documentation
- Aim for high coverage on business logic (services, workflow)
- Integration tests for API endpoints
- E2E tests for critical user flows

---

## Work Items

Work items are the central unit of work. Each item is a spec, PRD, or user story with clearly defined outcomes.

### Data Model

```typescript
// src/models/work-item.ts
import { z } from "zod";

export const WorkItemType = z.enum(["feature", "bug", "research", "task"]);
export type WorkItemType = z.infer<typeof WorkItemType>;

export const WorkItemStatus = z.enum([
  "backlog",
  "ready",
  "in_progress",
  "review",
  "done",
]);
export type WorkItemStatus = z.infer<typeof WorkItemStatus>;

export const Transition = z.enum([
  "backlog_to_ready",
  "ready_to_in_progress",
  "in_progress_to_review",
  "review_to_done",
  "review_to_in_progress", // Rework
]);
export type Transition = z.infer<typeof Transition>;

export const SuccessCriterionSchema = z.object({
  id: z.string().uuid(),
  description: z.string(),
  completed: z.boolean().default(false),
  verifiedBy: z.string().optional(), // agent_id or user_id
  verifiedAt: z.date().optional(),
});
export type SuccessCriterion = z.infer<typeof SuccessCriterionSchema>;

export const WorkItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  type: WorkItemType,
  status: WorkItemStatus,

  // Content
  description: z.string(), // Full PRD/spec content (markdown)
  successCriteria: z.array(SuccessCriterionSchema),
  linkedFiles: z.array(z.string()), // Paths to relevant files

  // Workflow
  createdBy: z.string(),
  assignedAgents: z.record(z.string(), z.string().optional()), // role -> agent_id
  requiresApproval: z.record(Transition, z.boolean()),

  // Tracking
  createdAt: z.date(),
  updatedAt: z.date(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),

  // Relationships
  parentId: z.string().uuid().optional(),
  childIds: z.array(z.string().uuid()),
  blockedBy: z.array(z.string().uuid()),
});
export type WorkItem = z.infer<typeof WorkItemSchema>;
```

### Kanban Columns

| Column | Entry Criteria | Exit Criteria |
|--------|----------------|---------------|
| **Backlog** | Item created | Success criteria defined and approved |
| **Ready** | Has success criteria | Agent assigned and starts work |
| **In Progress** | Agent working | All success criteria addressed |
| **Review** | Work complete | Human/agent approves or requests rework |
| **Done** | Approved | Archived |

---

## Agent Templates

Agent templates wrap Claude Agent SDK configuration with metadata for the Agent Ops system. Users can create custom templates alongside built-ins.

### Data Model

```typescript
// src/models/template.ts
import { z } from "zod";

export const AgentRole = z.enum(["refiner", "implementer", "tester", "reviewer"]);
export type AgentRole = z.infer<typeof AgentRole>;

export const PermissionMode = z.enum(["askUser", "acceptEdits", "bypassPermissions"]);
export type PermissionMode = z.infer<typeof PermissionMode>;

export const MCPServerConfigSchema = z.object({
  name: z.string(),
  type: z.enum(["stdio", "sse", "inprocess"]),
  command: z.string().optional(), // For stdio servers
  url: z.string().url().optional(), // For SSE servers
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}), // Supports ${VAR} interpolation
});
export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;

export const AgentTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string(),
  createdBy: z.string(), // "system" | user_id

  // Claude Agent SDK configuration
  systemPrompt: z.string(),
  permissionMode: PermissionMode,
  maxTurns: z.number().int().positive().default(100),

  // Tools
  builtinTools: z.array(z.string()), // ["Read", "Write", "Bash", "Glob", "WebSearch"]
  mcpServers: z.array(MCPServerConfigSchema),

  // Agent Ops metadata
  allowedWorkItemTypes: z.array(z.string()).default(["*"]),
  defaultRole: AgentRole.optional(),
});
export type AgentTemplate = z.infer<typeof AgentTemplateSchema>;
```

### Built-in Templates

#### Refiner
```yaml
name: Refiner
description: Analyzes specs and adds success criteria
systemPrompt: |
  You are a senior engineer refining work items.
  Your job is to:
  - Identify ambiguities in the spec
  - Define clear, testable success criteria
  - Flag missing information or dependencies
  - Estimate complexity
  - Create child tasks if needed
  
  Output structured success criteria that are specific and verifiable.

permissionMode: askUser
builtinTools:
  - Read
  - Glob
  - WebSearch
mcpServers: []
defaultRole: refiner
```

#### Implementer
```yaml
name: Implementer
description: Implements features and fixes based on specs
systemPrompt: |
  You are a senior engineer implementing work items.
  Your job is to:
  - Read and understand the spec and success criteria
  - Write clean, well-tested code
  - Follow existing project conventions
  - Commit changes with clear messages
  - Mark success criteria as complete when addressed
  
  If you discover additional work needed, create backlog items.

permissionMode: acceptEdits
builtinTools:
  - Read
  - Write
  - Bash
  - Glob
mcpServers: []
defaultRole: implementer
```

#### Tester
```yaml
name: Tester
description: Writes and runs tests to verify success criteria
systemPrompt: |
  You are a QA engineer verifying work items.
  Your job is to:
  - Review success criteria
  - Write tests that verify each criterion
  - Run tests and report results
  - Flag any criteria not met
  - Document edge cases found

permissionMode: acceptEdits
builtinTools:
  - Read
  - Write
  - Bash
  - Glob
mcpServers: []
defaultRole: tester
```

#### Reviewer
```yaml
name: Reviewer
description: Reviews code changes for quality and correctness
systemPrompt: |
  You are a senior engineer reviewing work.
  Your job is to:
  - Review code changes for quality, correctness, and style
  - Verify success criteria are properly addressed
  - Check for potential issues or improvements
  - Approve or request specific changes
  
  Be constructive and specific in feedback.

permissionMode: askUser
builtinTools:
  - Read
  - Glob
mcpServers: []
defaultRole: reviewer
```

---

## Agent Workers

Workers are instantiated from templates and assigned to work items. The system maintains a pool of workers with configurable concurrency.

### Data Model

```typescript
// src/models/worker.ts
import { z } from "zod";
import { AgentRole } from "./template";

export const WorkerStatus = z.enum([
  "idle",
  "working",
  "paused",
  "error",
  "terminated",
]);
export type WorkerStatus = z.infer<typeof WorkerStatus>;

export const AgentWorkerSchema = z.object({
  id: z.string().uuid(),
  templateId: z.string().uuid(),
  status: WorkerStatus,

  // Current work
  currentWorkItemId: z.string().uuid().optional(),
  currentRole: AgentRole.optional(),

  // SDK state
  sessionId: z.string(),

  // Metrics
  spawnedAt: z.date(),
  contextWindowUsed: z.number().int().nonnegative(),
  contextWindowLimit: z.number().int().positive(),
  tokensUsed: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
});
export type AgentWorker = z.infer<typeof AgentWorkerSchema>;

export interface WorkerPool {
  maxWorkers: number; // User-configurable limit
  workers: Map<string, AgentWorker>;
  queue: Array<{ workItemId: string; role: AgentRole }>;
}
```

### Worker Lifecycle

```
                    ┌─────────┐
                    │  Spawn  │
                    └────┬────┘
                         │
                         ▼
┌──────────┐        ┌─────────┐        ┌─────────────┐
│  Error   │◄───────│  Idle   │◄───────│   Working   │
└────┬─────┘        └────┬────┘        └──────┬──────┘
     │                   │                    │
     │                   ▼                    │
     │              ┌─────────┐               │
     └─────────────►│Terminate│◄──────────────┘
                    └─────────┘
```

---

## Workflow Engine

### Approval Gates

Each transition can require human approval. Default is conservative (all approvals required), configurable to autonomous.

```typescript
// src/services/workflow-engine.ts
import { Transition } from "../models/work-item";

export interface WorkflowConfig {
  requireApproval: Record<Transition, boolean>;
}

export const defaultWorkflowConfig: WorkflowConfig = {
  requireApproval: {
    backlog_to_ready: true,      // Human verifies criteria
    ready_to_in_progress: false, // Auto-assign agent
    in_progress_to_review: false, // Auto when complete
    review_to_done: true,        // Human final approval
    review_to_in_progress: true, // Human decides rework
  },
};
```

### Work Assignment

```typescript
// src/services/work-assignment.ts
import { WorkerPool, AgentWorker } from "../models/worker";
import { WorkItem } from "../models/work-item";
import { AgentRole } from "../models/template";

export async function assignWork(
  pool: WorkerPool,
  item: WorkItem,
  role: AgentRole
): Promise<void> {
  // Find idle worker with matching template
  let worker = findAvailableWorker(pool, role);

  if (!worker) {
    if (pool.workers.size < pool.maxWorkers) {
      // Spawn new worker from role's default template
      worker = await spawnWorker(role);
    } else {
      // Queue for later
      pool.queue.push({ workItemId: item.id, role });
      return;
    }
  }

  // Assign work
  worker.currentWorkItemId = item.id;
  worker.currentRole = role;
  worker.status = "working";

  // Start agent with work item context
  await startAgentWork(worker, item, role);
}
```

---

## Design System

The frontend uses a modern, dark-mode design with a cohesive visual language built on CSS custom properties and Tailwind CSS utility classes.

### Color Palette

```css
/* Backgrounds */
--bg-deep: #0a0e14       /* Deepest background */
--bg-card: #111820       /* Card backgrounds */
--bg-elevated: #1a2230   /* Elevated surfaces */
--bg-hover: #242d3a      /* Hover states */

/* Accent Colors */
--cyan-glow: #00f0ff     /* Primary accent, active states */
--cyan-dim: #0891b2      /* Muted cyan */
--emerald: #10b981       /* Success, completed, active */
--amber: #f59e0b         /* Warning, pending, in progress */
--rose: #f43f5e          /* Error, high priority */
--violet: #8b5cf6        /* Secondary accent */
--blue: #3b82f6          /* Information, alternative accent */

/* Text */
--text-primary: #f1f5f9  /* Primary text */
--text-secondary: #94a3b8 /* Secondary text */
--text-muted: #64748b    /* Muted text */

/* Glow Effects */
--glow-cyan: 0 0 20px rgba(0, 240, 255, 0.3)
--glow-emerald: 0 0 20px rgba(16, 185, 129, 0.3)
--glow-rose: 0 0 20px rgba(244, 63, 94, 0.3)
```

### Typography

| Element | Font | Weight | Usage |
|---------|------|--------|-------|
| UI Text | Outfit | 300-700 | Headings, labels, body text |
| Data/Code | JetBrains Mono | 400-500 | Metrics, file paths, monospace |

### Status Color Conventions

| Color | Meaning |
|-------|---------|
| Emerald/Green | Active, success, completed |
| Amber/Yellow | Idle, pending, in progress |
| Rose/Red | Error, high priority, warnings |
| Cyan | Primary accent, active states |
| Violet | Secondary accent, alternative states |
| Blue | Information, alternative accent |

### Animations

| Animation | Duration | Usage |
|-----------|----------|-------|
| `pulse-glow` | 3s infinite | Active status indicators |
| `slideIn` | 0.3s | Sidebar reveal |
| `slideUp` | 0.4s | Page entrance |
| `fadeIn` | 0.5s | Staggered list items |
| `blink` | 1s infinite | Live status dots |

### Component Patterns

**Cards**: Elevated background with subtle border, glow on hover
```css
.card-hover {
  transition: transform 0.2s, box-shadow 0.2s;
}
.card-hover:hover {
  transform: translateY(-2px);
  box-shadow: var(--glow-cyan);
}
```

**Status Badges**: Color-coded with semi-transparent backgrounds
- `.status-active` - Green with pulse animation
- `.status-idle` - Amber
- `.status-error` - Rose

**Buttons**: Gradient backgrounds with glow effects
- `.btn-primary-gradient` - Cyan-to-blue gradient

---

## Dashboard & Observability

### Implemented UI Components

#### Mission Control Dashboard
The main dashboard serves as "Mission Control" with real-time visibility into agent operations:

**Header Section**
- Live status indicator with blinking green dot
- Global search bar (Cmd+K shortcut)
- Primary "New Task" action button
- User avatar

**Stats Cards** (4-column responsive grid)
- Active Agents count with trend indicator
- Tasks Completed with percentage change
- Queue Depth showing pending items
- Success Rate percentage

**Task Throughput Chart**
- Grouped bar chart (completed vs pending)
- Time period selector (24h, 7d, 30d)
- Color-coded bars (emerald/amber)

**Active Agents Grid**
- 3-column responsive layout
- Agent cards with:
  - Emoji avatar with gradient background
  - Agent name and type
  - Status indicator (active/idle/error)
  - Task count and success rate

**Live Activity Feed**
- Scrollable list of recent events
- Status-colored icons
- Agent name highlighting
- Monospace timestamps

**Up Next Queue**
- Priority-coded task list
- Assignment status badges
- Colored priority indicators

#### Kanban Board
5-column workflow board with drag-and-drop:

**Columns**: Backlog → To Do → In Progress → Review → Done

**Task Cards**
- Priority indicator (colored dots)
- Title and description
- Tag system with color mapping:
  - `auth` (cyan), `feature` (blue), `database` (violet)
  - `api` (amber), `security` (rose), `testing` (emerald)
- Agent assignment indicator
- Drag handle (hover reveal)
- Options menu (hover reveal)

#### Agent Panel
Comprehensive agent monitoring view:

**Agent Cards**
- Color-coded top border (status)
- Status badge (active/paused/idle)
- Control buttons (play/pause, reset)
- Current task display
- Animated progress bar
- 12-month activity sparkline
- Stats footer (followers, tasks, avg time)

**Filtering**
- Search by agent name
- Status filter tabs (all/active/paused/idle)

#### Templates View
Template management with card-based layout:

- Template cards with step previews
- Usage statistics
- Action buttons (edit, duplicate, delete)

#### Settings Panel
User preferences organized in 6 sections:

- Profile, Notifications, Security
- Appearance, API, Integrations
- Toggle controls with visual feedback
- Usage statistics display

### Agent Metrics

| Metric | Description |
|--------|-------------|
| Active agents | Currently running workers |
| Agent status | Idle, working, paused, error |
| Current task | What each agent is working on |
| Context window | Tokens used / limit (e.g., 45k / 200k) |
| Context % | Visual fill indicator, warn at 80% |
| Token usage | Per agent, cumulative session total |
| Cost | USD per agent, running total |
| Latency | Avg response time per turn |
| Tool calls | Count, success/failure rate |
| Uptime | Time since spawn |

### Work Metrics

| Metric | Description |
|--------|-------------|
| Items by status | Counts per column |
| Cycle time | Avg time Ready → Done |
| Throughput | Items completed per day/week |
| Blocked items | Waiting on human approval |
| Rework rate | Items sent back from Review |
| Agent efficiency | Items completed per agent-hour |
| Cost per item | Avg tokens/cost per work item |

### System Metrics

| Metric | Description |
|--------|-------------|
| Queue depth | Ready items waiting for agents |
| Agent utilization | % of max_workers actively working |
| Approval backlog | Items awaiting human review |
| Error rate | Failed agent runs |
| API usage | Anthropic requests, rate limit headroom |

### Real-time Events

WebSocket streaming of:
- Agent state changes
- Tool calls (with inputs/outputs)
- Work item transitions
- Token/cost updates
- Errors and warnings

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           BROWSER (React)                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Dashboard  │  │ Kanban Board │  │ Agent Panel  │  │  Templates   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘ │
└─────────────────────────────┬───────────────────────────────────────────┘
                              │ WebSocket + REST
┌─────────────────────────────┴───────────────────────────────────────────┐
│                         BACKEND (Fastify)                                │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                       Workflow Engine                               │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │ │
│  │  │  Work Item  │  │   Worker    │  │  Approval   │                 │ │
│  │  │  Manager    │  │    Pool     │  │   Gates     │                 │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                 │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │   Agent     │  │ Observability│  │  Template   │  │    Session     │ │
│  │   Manager   │  │   Collector  │  │   Registry  │  │    Manager     │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘ │
└─────────────────────────────┬───────────────────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────────────────┐
│                       Claude Agent SDK                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │ @anthropic-ai/claude-code + Hooks + MCP Servers                     ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

---

## API Design

### REST Endpoints

#### Work Items
```
POST   /api/work-items                     # Create work item
GET    /api/work-items                     # List work items (filterable)
GET    /api/work-items/{id}                # Get work item details
PATCH  /api/work-items/{id}                # Update work item
DELETE /api/work-items/{id}                # Delete work item
POST   /api/work-items/{id}/transition     # Move to next status
POST   /api/work-items/{id}/assign         # Assign agent to role
```

#### Agent Templates
```
GET    /api/templates                      # List templates
POST   /api/templates                      # Create custom template
GET    /api/templates/{id}                 # Get template details
PATCH  /api/templates/{id}                 # Update template
DELETE /api/templates/{id}                 # Delete template
```

#### Workers
```
GET    /api/workers                        # List active workers
GET    /api/workers/{id}                   # Get worker details
POST   /api/workers/{id}/pause             # Pause worker
POST   /api/workers/{id}/resume            # Resume worker
POST   /api/workers/{id}/terminate         # Terminate worker
POST   /api/workers/{id}/inject            # Inject context
```

#### Dashboard
```
GET    /api/metrics/agents                 # Agent metrics
GET    /api/metrics/work                   # Work item metrics
GET    /api/metrics/system                 # System metrics
GET    /api/traces                         # Trace events
GET    /api/traces/{worker_id}             # Worker-specific traces
```

#### Config
```
GET    /api/config/workflow                # Get workflow config
PATCH  /api/config/workflow                # Update approval gates
GET    /api/config/pool                    # Get pool config
PATCH  /api/config/pool                    # Update max_workers, etc.
```

### WebSocket

```typescript
// Server → Client
interface ServerEvent {
  type: "agent_state" | "work_item_update" | "tool_call" | 
        "metric_update" | "error" | "approval_required";
  timestamp: string;
  data: unknown;
}

// Client → Server
interface ClientCommand {
  type: "pause" | "resume" | "terminate" | "inject" | 
        "approve" | "reject" | "assign";
  workerId?: string;
  workItemId?: string;
  payload?: unknown;
}
```

---

## Tech Stack

### Backend
- Node.js 20+ (LTS)
- TypeScript 5+
- Fastify
- @fastify/websocket
- Zod (validation)
- Drizzle ORM
- better-sqlite3 (MVP) → PostgreSQL (production)
- @anthropic-ai/claude-code (Claude Agent SDK)
- Vitest (testing)

### Frontend
- React 19.2+ with TypeScript
- Vite 7.2
- Tailwind CSS 4.1 + tailwind-merge
- Lucide React (icon library)
- @dnd-kit (drag-and-drop for Kanban)
- React Query 5.90 (@tanstack/react-query)
- React Router 7.11
- Zustand 5.0
- Vitest + React Testing Library

### Design Assets
- **Fonts**: Outfit (UI), JetBrains Mono (code/data)
- **Icons**: Lucide React (30+ icons used)

### Development Tools
- ESLint + Prettier
- Husky (git hooks)
- lint-staged
- tsx (TypeScript execution)

---

## Project Structure

```
agent-ops/
├── backend/
│   ├── src/
│   │   ├── index.ts                 # Entry point
│   │   ├── app.ts                   # Fastify app setup
│   │   ├── config.ts                # Environment config
│   │   ├── models/
│   │   │   ├── work-item.ts
│   │   │   ├── template.ts
│   │   │   ├── worker.ts
│   │   │   └── trace.ts
│   │   ├── db/
│   │   │   ├── index.ts             # Database connection
│   │   │   ├── schema.ts            # Drizzle schema
│   │   │   └── migrations/
│   │   ├── repositories/
│   │   │   ├── work-item.repository.ts
│   │   │   ├── template.repository.ts
│   │   │   └── worker.repository.ts
│   │   ├── services/
│   │   │   ├── work-item.service.ts
│   │   │   ├── worker-pool.service.ts
│   │   │   ├── template-registry.service.ts
│   │   │   ├── workflow-engine.service.ts
│   │   │   ├── agent-manager.service.ts
│   │   │   ├── observability.service.ts
│   │   │   └── websocket-hub.service.ts
│   │   ├── routes/
│   │   │   ├── work-items.routes.ts
│   │   │   ├── templates.routes.ts
│   │   │   ├── workers.routes.ts
│   │   │   ├── metrics.routes.ts
│   │   │   └── ws.routes.ts
│   │   ├── hooks/
│   │   │   ├── trace.hook.ts
│   │   │   └── pause.hook.ts
│   │   └── templates/               # Built-in YAML templates
│   │       ├── refiner.yaml
│   │       ├── implementer.yaml
│   │       ├── tester.yaml
│   │       └── reviewer.yaml
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── setup.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── main.tsx                 # React bootstrap
│   │   ├── App.tsx                  # Router setup
│   │   ├── index.css                # Global styles & design system
│   │   ├── components/
│   │   │   └── Layout.tsx           # Navigation & sidebar
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx        # Mission Control view
│   │   │   ├── Kanban.tsx           # Board view
│   │   │   ├── Agents.tsx           # Agent monitoring
│   │   │   ├── Templates.tsx        # Template management
│   │   │   └── Settings.tsx         # User settings
│   │   ├── hooks/
│   │   ├── stores/
│   │   ├── api/
│   │   └── lib/
│   │       └── utils.ts             # Helper functions (cn, etc.)
│   ├── tests/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## Testing Strategy

### Unit Tests
- All services and repositories
- Zod schema validation
- Workflow state machine logic
- Utility functions

### Integration Tests
- API endpoints (using Fastify's inject)
- Database operations
- WebSocket message handling

### E2E Tests (Future)
- Critical user flows with Playwright
- Work item lifecycle
- Agent execution scenarios

### Test Commands
```bash
# Backend
pnpm test           # Run all tests
pnpm test:unit      # Unit tests only
pnpm test:int       # Integration tests only
pnpm test:coverage  # With coverage report

# Frontend
pnpm test           # Run all tests
pnpm test:ui        # Interactive UI
```

---

## MVP Scope

1. ✅ Kanban board (Backlog → Ready → In Progress → Review → Done)
2. ✅ Work items with specs + success criteria
3. ✅ Agent templates (built-in + user-defined) with MCP support
4. ✅ Worker pool instantiated from templates
5. ✅ Configurable human approval gates
6. ✅ Parallelism limits (max_workers)
7. ✅ Real-time observability via WebSocket
8. ✅ Dashboard (agents, work items, system metrics)
9. ✅ Per-agent context window tracking

---

## Future Considerations

1. PostgreSQL persistence
2. Multi-user authentication
3. Workflow automation rules
4. Visual workflow builder
5. Plugin system for custom tools
6. Cost budget controls
7. Cloud deployment
8. Team collaboration features
9. Audit logging
10. A/B testing agent configurations
