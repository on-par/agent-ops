# Agent Ops Platform - Comprehensive Research Document

## 1. Problem Overview

### Clear Problem Statement
Implement 25 in-progress tasks across 6 major themes to complete the Agent Ops platform—a system for managing AI agents that work on software development tasks using Docker containers, real-time dashboards, and the Claude SDK.

### Key Objectives
1. **Docker/Container Infrastructure**: Create ARM64-compatible agent Docker images with full lifecycle management and real-time log streaming
2. **GitHub UI Integration**: Build real-time status dashboards with PR/issue deep linking and repository management
3. **WebSocket/API Backend**: Implement configuration management and complete WebSocket protocol for real-time updates
4. **Dashboard UI Components**: Create terminal displays, agent cards, and execution timelines using xterm.js
5. **Frontend Integration**: Replace mock data with real APIs, implement drag-and-drop Kanban, integrate WebSocket events
6. **Backend Claude SDK Integration**: Implement agent manager service, observability hooks, and YAML-based role templates

### Success Criteria
- All 25 beads moved from `in_progress` to `done`
- Full E2E flow: Start agent → view logs → stop agent → cleanup container
- Real-time updates across all dashboard components
- All mock data replaced with live API calls
- Agent templates configurable via YAML files

---

## 2. Web Research Findings

### Theme 1: Docker/Container Infrastructure

#### dockerode for Container Management
**Package**: `dockerode` (already installed)
```javascript
const Docker = require('dockerode');
const docker = new Docker({socketPath: '/var/run/docker.sock'});

// Stream logs with follow
container.logs({
  follow: true,
  stdout: true,
  stderr: true,
  timestamps: true
});
```
**Best Practices**:
- Use `follow: true` for streaming (returns stream, not string)
- Handle TTY vs non-TTY container demultiplexing
- Always destroy streams on client disconnect

#### ARM64 Multi-Architecture Builds
```dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app .
CMD ["node", "index.js"]
```
**Build Command**:
```bash
docker buildx build --platform linux/amd64,linux/arm64 -t agent-ops:latest .
```
**Benefits**: node:20-slim reduces image 100MB+, NODE_ENV=production reduces memory 30%

#### SSE for Log Streaming
```javascript
// Fastify SSE endpoint
fastify.get('/container/:id/logs', async (req, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const logStream = await container.logs({ follow: true, stdout: true, stderr: true });
  logStream.on('data', (chunk) => {
    reply.raw.write(`data: ${chunk.toString()}\n\n`);
  });

  req.raw.on('close', () => logStream.destroy());
});
```

### Theme 2: GitHub UI Integration

#### GitHub REST API for Deep Linking
```javascript
// PR links: https://github.com/{owner}/{repo}/pull/{number}
// Issue links: https://github.com/{owner}/{repo}/issues/{number}
// Auto-link: "Closes #123" in PR description

async function getPullRequest(owner, repo, prNumber) {
  return fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, {
    headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
  });
}
```

#### Real-Time Dashboard with WebSocket
```javascript
// Backend broadcasts updates
connection.socket.send(JSON.stringify({
  type: 'DASHBOARD_UPDATE',
  data: { agentCount: 5, activeJobs: 3 }
}));

// Frontend receives and updates state
ws.onmessage = (event) => {
  const { type, data } = JSON.parse(event.data);
  if (type === 'DASHBOARD_UPDATE') setDashboard(data);
};
```

### Theme 3: WebSocket/API Backend

#### Fastify WebSocket with @fastify/websocket
```javascript
await fastify.register(require('@fastify/websocket'));

fastify.route({
  method: 'GET',
  url: '/ws/agents',
  wsHandler: (connection, req) => {
    connection.socket.on('message', (msg) => {
      const data = JSON.parse(msg.toString());
      // Handle ClientCommands
    });
  },
  websocket: true
});
```
**Critical**: Register WebSocket plugin BEFORE all routes

#### Configuration Management Pattern
```javascript
fastify.patch('/api/config', {
  schema: {
    body: { type: 'object', additionalProperties: false, properties: {...} }
  }
}, async (req, reply) => {
  return await updateConfiguration(req.body);
});
```

### Theme 4: Dashboard UI Components

#### xterm.js with React (react-xtermjs)
```javascript
import { useXTerm } from 'react-xtermjs';
import { FitAddon } from '@xterm/addon-fit';

function Terminal() {
  const { instance, ref } = useXTerm();

  useEffect(() => {
    if (instance) {
      const fitAddon = new FitAddon();
      instance.loadAddon(fitAddon);
      setTimeout(() => fitAddon.fit(), 0); // After DOM render

      window.addEventListener('resize', () => fitAddon.fit());
    }
  }, [instance]);

  return <div ref={ref} style={{ height: '100%' }} />;
}
```

#### ANSI Color Support (Native in xterm.js)
```javascript
const ANSI = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  rgb: (r, g, b) => `\x1b[38;2;${r};${g};${b}m`
};

instance.writeln(`${ANSI.green}✓ Success${ANSI.reset}`);
```

### Theme 5: Frontend Integration

#### react-use-websocket with Reconnection
```javascript
import useWebSocket from 'react-use-websocket';

const { sendMessage, lastMessage, readyState } = useWebSocket(
  'ws://localhost:3000/ws/agents',
  {
    shouldReconnect: () => true,
    reconnectAttempts: 10,
    reconnectInterval: (attempt) => Math.min(Math.pow(2, attempt) * 1000, 10000),
    share: true // Share connection across components
  }
);
```

#### @dnd-kit for Kanban Board
```javascript
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';

function KanbanCard({ task }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: task.id,
    data: { task }
  });
  return <div ref={setNodeRef} {...listeners} {...attributes}>{task.title}</div>;
}

function KanbanLane({ column }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return <div ref={setNodeRef} style={{ background: isOver ? '#f0f0f0' : '#fff' }}>...</div>;
}
```

#### React Query + WebSocket Integration
```javascript
const queryClient = useQueryClient();

useWebSocket('ws://localhost:3000/ws', {
  onMessage: (event) => {
    const { type, queryKey, data } = JSON.parse(event.data);
    if (type === 'INVALIDATE') {
      queryClient.invalidateQueries({ queryKey });
    } else if (type === 'UPDATE') {
      queryClient.setQueryData(queryKey, data);
    }
  },
  share: true
});
```

### Theme 6: Claude Agent SDK Integration

#### Agent Spawning with Claude SDK
```javascript
import { ClaudeSDKClient } from '@anthropic-ai/claude-agent-sdk';

const client = new ClaudeSDKClient({
  apiKey: process.env.ANTHROPIC_API_KEY,
  settingSources: ['./.claude/settings.json']
});

const session = await client.createSession({
  systemPrompt: 'You are an expert DevOps agent...',
  compact: true // Auto-summarize on context limit
});
```

#### Trace Hooks for Observability
```javascript
const client = new ClaudeSDKClient({
  hooks: {
    preToolUse: async (ctx) => {
      await logToObservability({ event: 'pre_tool', tool: ctx.toolName });
      return { continue: true };
    },
    postToolUse: async (ctx) => {
      await logToObservability({ event: 'post_tool', result: ctx.result, duration: ctx.duration });
      return { continue: true };
    },
    sessionEnd: async (ctx) => {
      await logSessionMetrics({ tokens: ctx.totalTokens, cost: ctx.totalCost });
      return { continue: true };
    }
  }
});
```

#### YAML Template Configuration
```markdown
<!-- File: .claude/agents/implementer.md -->
---
name: implementer
description: Code implementation agent
tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
permissionMode: acceptEdits
---

# Implementer Agent

You implement features following TDD:
1. Write failing test
2. Implement minimal code
3. Refactor

Never modify files without explicit approval.
```

---

## 3. Codebase Analysis

### Current Architecture
- **Backend**: Fastify + TypeScript, Vertical Slice Architecture
- **Frontend**: React 19 + Vite + TypeScript
- **Database**: SQLite + Drizzle ORM
- **Real-time**: Fastify WebSocket + react-use-websocket
- **Testing**: Vitest for both backend and frontend

### Theme-by-Theme Status

#### Theme 1: Docker/Container Infrastructure
| Component | Status | Location |
|-----------|--------|----------|
| Dockerfile | ❌ MISSING | Need: `/backend/Dockerfile` |
| Container Service | ✅ EXISTS | `/backend/src/features/containers/services/container-manager.service.ts` |
| SSE Logs Endpoint | ✅ EXISTS | `/backend/src/features/containers/handler/container-logs.handler.ts` |
| REST API | ✅ EXISTS | `/backend/src/features/containers/handler/container.handler.ts` |
| dockerode | ✅ INSTALLED | `backend/package.json` line 39 |

#### Theme 2: GitHub UI Integration
| Component | Status | Location |
|-----------|--------|----------|
| Dashboard Page | ✅ EXISTS (mock data) | `/frontend/src/pages/Dashboard.tsx` lines 20-206 |
| GitHub Service | ✅ EXISTS | `/backend/src/features/github/services/github.service.ts` |
| WebSocket Hub | ✅ EXISTS | `/backend/src/shared/websocket/websocket-hub.service.ts` |
| Octokit | ✅ INSTALLED | `backend/package.json` line 44 |

#### Theme 3: WebSocket/API Backend
| Component | Status | Location |
|-----------|--------|----------|
| WebSocket Plugin | ✅ EXISTS | `/backend/src/app.ts` |
| WebSocket Hub | ✅ EXISTS | `/backend/src/shared/websocket/websocket-hub.service.ts` |
| Config Routes | ❌ MISSING | Need: `/backend/src/features/config/handler/config.handler.ts` |
| Event Types | ✅ DEFINED | websocket-hub.service.ts lines 6-18 |

#### Theme 4: Dashboard UI Components
| Component | Status | Location |
|-----------|--------|----------|
| xterm.js | ✅ INSTALLED | `frontend/package.json` lines 19-21 |
| Terminal Component | ✅ EXISTS | `/frontend/src/components/containers/ContainerTerminal.tsx` |
| Log Viewer | ✅ EXISTS | `/frontend/src/components/containers/ContainerLogs.tsx` |
| Agent Cards | ✅ EXISTS (mock) | `/frontend/src/pages/Agents.tsx` lines 179-332 |

#### Theme 5: Frontend Integration
| Component | Status | Location |
|-----------|--------|----------|
| react-use-websocket | ✅ INSTALLED & USED | `/frontend/src/hooks/use-websocket.ts` |
| @dnd-kit | ✅ INSTALLED, ❌ UNUSED | `frontend/package.json` lines 13-14 |
| React Query | ✅ CONFIGURED | Throughout hooks/ |
| Mock Data | ❌ IN ALL PAGES | Dashboard, Kanban, Agents |

#### Theme 6: Backend Claude SDK Integration
| Component | Status | Location |
|-----------|--------|----------|
| @anthropic-ai/sdk | ✅ INSTALLED | `backend/package.json` line 26 |
| Agent Engine | ✅ EXISTS | `/backend/src/features/agent-runtime/services/agent-engine.service.ts` |
| Template YAML | ❌ MISSING | Need: `/backend/templates/*.yaml` |
| Lifecycle Hooks | ❌ MISSING | Need in: agent-lifecycle.service.ts |

### Files to Create (NEW)
```
/backend/Dockerfile                                          (4ka.1)
/backend/templates/refiner.yaml                              (avw.4)
/backend/templates/implementer.yaml                          (avw.5)
/backend/templates/tester.yaml                               (avw.6)
/backend/templates/reviewer.yaml                             (avw.7)
/backend/src/features/config/handler/config.handler.ts       (ll0.5)
/frontend/src/components/github/RepositorySelector.tsx       (kpr.4)
/frontend/src/components/executions/ExecutionTimeline.tsx    (4ka.8)
```

### Files to Modify (EXISTING)
```
/backend/src/app.ts                                          - Register config routes (ll0.5)
/backend/src/features/agent-runtime/services/agent-lifecycle.service.ts
                                                             - Container integration (4ka.2), hooks (avw.3)
/backend/src/features/agent-runtime/services/agent-engine.service.ts
                                                             - Trace hooks (avw.2)
/backend/src/shared/websocket/websocket-hub.service.ts       - New event types (ll0.6)
/frontend/src/pages/Dashboard.tsx                            - Replace mock lines 20-206 (kpr.1, 4yu.8)
/frontend/src/pages/Kanban.tsx                               - Drag-drop + API (4yu.7, 4yu.9)
/frontend/src/pages/Agents.tsx                               - Replace mock lines 23-114 (4yu.10)
```

---

## 4. Proposed Solution Approach

### High-Level Strategy
Execute in **6 phases** aligned with dependency order, enabling parallel work where possible.

### Phase 1: Infrastructure Foundation (4ka.1, ll0.5, ll0.6)
**Goal**: Create agent execution environment and complete backend APIs
1. Create `/backend/Dockerfile` with node:20-slim base, ARM64 support
2. Implement config routes handler with GET/PATCH endpoints
3. Add new WebSocket event types for containers and executions

### Phase 2: Backend Integration (4ka.2, avw.1-3)
**Goal**: Connect containers to agent lifecycle with observability
1. Integrate container creation into `agent-lifecycle.service.ts`
2. Add trace hooks to `agent-engine.service.ts` for tool call logging
3. Implement pause hook for agent execution control

### Phase 3: Template System (avw.4-7)
**Goal**: Create YAML templates for agent roles
1. Create `/backend/templates/` directory
2. Define YAML schema for templates (name, description, tools, model, permissionMode)
3. Create Refiner, Implementer, Tester, Reviewer templates
4. Update TemplateRegistryService to load from YAML

### Phase 4: Dashboard Real-time (kpr.1, kpr.3, ll0.6)
**Goal**: Connect dashboard to real data with WebSocket updates
1. Create dashboard API hooks (useDashboardStats, useActiveAgents)
2. Replace mock data in Dashboard.tsx with React Query hooks
3. Implement RepositorySelector component with GitHub API
4. Wire WebSocket events for real-time updates

### Phase 5: Frontend Data Integration (4yu.6-10)
**Goal**: Replace all mock data, implement drag-drop
1. Implement @dnd-kit in Kanban.tsx for column drag-drop
2. Create useWorkItems hook for Kanban data
3. Replace Agents.tsx mock data with useWorkers hook
4. Verify WebSocket cache invalidation works across all pages

### Phase 6: UI Polish & E2E (4ka.5-8, kpr.4)
**Goal**: Complete UI components and E2E testing
1. Verify terminal component with SSE streaming
2. Add PR/issue deep links to GitHubLinks component
3. Create ExecutionTimeline component for agent execution visualization
4. Write E2E tests for complete flow

### Technology Choices Justification
| Choice | Justification |
|--------|---------------|
| dockerode | Already installed, proven in codebase, native promises |
| better-sse | Already used for container logs, simpler than WS for streaming |
| react-use-websocket | Already integrated with React Query, reconnection built-in |
| @dnd-kit | Already installed, modern replacement for react-beautiful-dnd |
| YAML templates | Human-readable, version controllable, matches Claude SDK patterns |

### Risk Factors & Mitigations
| Risk | Mitigation |
|------|------------|
| Claude SDK confusion (@anthropic-ai/sdk vs claude-code) | Current SDK sufficient; clarify if Claude Code SDK needed |
| Mock data deeply embedded | Systematic replacement via React Query hooks |
| @dnd-kit unused | Follow established patterns from dnd-kit docs |
| WebSocket scaling | Redis adapter if multi-instance needed (future) |

---

## 5. Example Code Snippets

### Dockerfile (4ka.1)
```dockerfile
# /backend/Dockerfile
FROM node:20-slim AS base
RUN apt-get update && apt-get install -y git python3 && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Agent environment
ENV TASK_ID=""
ENV LLM_PROVIDER="anthropic"
ENV LLM_MODEL="claude-sonnet-4-20250514"
ENV LLM_BASE_URL=""
ENV LLM_API_KEY=""

CMD ["node", "dist/agent-runner.js"]
```

### Config Routes Handler (ll0.5)
```typescript
// /backend/src/features/config/handler/config.handler.ts
import { FastifyPluginAsync } from 'fastify';

const configHandler: FastifyPluginAsync = async (fastify) => {
  fastify.get('/workflow', async () => {
    return fastify.config.workflow;
  });

  fastify.patch('/workflow', {
    schema: {
      body: {
        type: 'object',
        properties: {
          maxConcurrentAgents: { type: 'number', minimum: 1, maximum: 10 },
          defaultModel: { type: 'string' }
        },
        additionalProperties: false
      }
    }
  }, async (request) => {
    const updates = request.body as Partial<WorkflowConfig>;
    return await fastify.configService.updateWorkflow(updates);
  });
};

export default configHandler;
```

### WebSocket Event Types (ll0.6)
```typescript
// Addition to /backend/src/shared/websocket/websocket-hub.service.ts
export type WebSocketEventType =
  | 'agent:started'
  | 'agent:stopped'
  | 'agent:progress'
  | 'agent:tool_call'      // NEW
  | 'agent:tool_result'    // NEW
  | 'container:started'    // NEW
  | 'container:stopped'    // NEW
  | 'container:logs'       // NEW
  | 'execution:started'    // NEW
  | 'execution:completed'  // NEW
  | 'work_item:created'
  | 'work_item:updated'
  | 'metrics:updated'
  | 'approval:requested'
  | 'approval:granted'
  | 'error';
```

### Template YAML (avw.5)
```yaml
# /backend/templates/implementer.yaml
name: implementer
description: Code implementation agent following TDD principles
model: claude-sonnet-4-20250514
permissionMode: acceptEdits
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob

systemPrompt: |
  You are an expert code implementer following Test-Driven Development.

  ## Process
  1. Read the task requirements thoroughly
  2. Write a failing test first (RED)
  3. Implement minimal code to pass (GREEN)
  4. Refactor while keeping tests green

  ## Constraints
  - Never modify code without writing tests first
  - Keep functions small and focused
  - Follow existing code patterns in the codebase
  - Ask for clarification if requirements are ambiguous
```

### Kanban Drag-Drop (4yu.7)
```tsx
// Update to /frontend/src/pages/Kanban.tsx
import { DndContext, DragEndEvent, useDroppable, useDraggable } from '@dnd-kit/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';

function KanbanBoard() {
  const queryClient = useQueryClient();
  const { data: workItems } = useWorkItems();

  const moveItem = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/api/work-items/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['work-items'] })
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      moveItem.mutate({ id: active.id as string, status: over.id as string });
    }
  };

  return (
    <DndContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4">
        {columns.map(col => (
          <KanbanColumn key={col.id} column={col} items={workItems?.filter(i => i.status === col.id)} />
        ))}
      </div>
    </DndContext>
  );
}
```

### Dashboard API Integration (4yu.8)
```tsx
// Update to /frontend/src/pages/Dashboard.tsx
import { useQuery } from '@tanstack/react-query';
import { useWebSocket } from '../hooks/use-websocket';

function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => fetch('/api/dashboard/stats').then(r => r.json()),
    staleTime: Infinity // Only update via WebSocket
  });

  const { data: agents } = useQuery({
    queryKey: ['agents', 'active'],
    queryFn: () => fetch('/api/agents?status=running').then(r => r.json())
  });

  // WebSocket for real-time updates (already handles invalidation via use-websocket.ts)
  useWebSocket();

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <StatsCards stats={stats} />
      <ActiveAgents agents={agents} />
    </div>
  );
}
```

---

## 6. Next Steps

### Prerequisites
1. ✅ dockerode installed
2. ✅ @dnd-kit installed
3. ✅ react-use-websocket installed and integrated
4. ✅ WebSocket hub service implemented
5. ❌ Need to create `/backend/templates/` directory
6. ❌ Need to create config handler

### Recommended Implementation Order

**Wave 1 (Parallel)**:
- [ ] 4ka.1: Create Dockerfile
- [ ] ll0.5: Implement config routes
- [ ] ll0.6: Add WebSocket event types

**Wave 2 (Sequential, depends on Wave 1)**:
- [ ] 4ka.2: Container lifecycle integration
- [ ] avw.1: Agent manager service updates
- [ ] avw.2: Trace hook implementation
- [ ] avw.3: Pause hook implementation

**Wave 3 (Parallel)**:
- [ ] avw.4: Refiner template YAML
- [ ] avw.5: Implementer template YAML
- [ ] avw.6: Tester template YAML
- [ ] avw.7: Reviewer template YAML

**Wave 4 (Parallel)**:
- [ ] kpr.1: Dashboard API integration
- [ ] kpr.3: PR and issue links
- [ ] kpr.4: Repository connection UI
- [ ] 4yu.8: Connect Dashboard to real data

**Wave 5 (Parallel)**:
- [ ] 4yu.6: WebSocket client (DONE)
- [ ] 4yu.7: Kanban drag-and-drop
- [ ] 4yu.9: Connect Kanban to real data
- [ ] 4yu.10: Connect Agents page to real data

**Wave 6 (Sequential)**:
- [ ] 4ka.5: Agent list component (verify with real data)
- [ ] 4ka.6: Terminal component (verify SSE)
- [ ] 4ka.7: Start agent flow
- [ ] 4ka.8: E2E test

### Testing Considerations

**Backend Tests** (Vitest):
- Container lifecycle integration tests
- WebSocket event emission tests
- Config handler validation tests
- Template YAML loading tests

**Frontend Tests** (Vitest):
- Drag-and-drop interaction tests
- React Query + WebSocket integration tests
- Dashboard data rendering tests
- Terminal component with mock SSE

**E2E Tests**:
- Start agent → view in list → view logs → stop → verify cleanup
- Kanban drag item → verify status change → verify persistence
- Dashboard real-time updates via WebSocket

---

## Dependencies Between Themes

```
┌─────────────────────────────────────────────────────────────────┐
│ THEME 1: Docker/Container                                       │
│ 4ka.1 Dockerfile ──┬──> 4ka.2 Lifecycle ──> 4ka.3 SSE (DONE)   │
│                    │                              ▲              │
│                    │                              │              │
│                    └──────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ THEME 6: Claude SDK                                             │
│ avw.1 Manager ──> avw.2 Trace ──> avw.3 Pause                  │
│       │                                                         │
│       └──> avw.4-7 Templates (parallel)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ THEME 3: WebSocket/API                                          │
│ ll0.5 Config Routes    ll0.6 WebSocket Events                  │
│         │                      │                                │
│         └──────────┬───────────┘                                │
│                    ▼                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ THEME 5: Frontend Integration                                   │
│ 4yu.6 WS Client (DONE)                                         │
│       │                                                         │
│       ├──> 4yu.7 Kanban DnD ──> 4yu.9 Kanban Data              │
│       │                                                         │
│       └──> 4yu.8 Dashboard Data ──> 4yu.10 Agents Data         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ THEME 2 & 4: GitHub UI + Dashboard Components                   │
│ kpr.1 Status Dashboard                                          │
│ kpr.3 PR/Issue Links                                           │
│ kpr.4 Repo Connection UI                                        │
│ 4ka.5-8 UI Components + E2E                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Sources

### Docker/Container
- [dockerode npm](https://www.npmjs.com/package/dockerode)
- [Multi-platform Docker builds](https://docs.docker.com/build/building/multi-platform/)
- [SSE with Node.js](https://medium.com/@akbarkusumanegaralth/stream-docker-log-with-server-sent-events-3f4fe19ca273)

### WebSocket/Real-time
- [Fastify WebSocket](https://www.videosdk.live/developer-hub/websocket/fastify-websocket)
- [react-use-websocket](https://www.npmjs.com/package/react-use-websocket)
- [TanStack Query + WebSockets](https://tkdodo.eu/blog/using-web-sockets-with-react-query)

### UI Components
- [react-xtermjs](https://www.qovery.com/blog/react-xtermjs-a-react-library-to-build-terminals)
- [@dnd-kit](https://dndkit.com/)
- [xterm.js ANSI colors](https://xtermjs.org/docs/api/vtfeatures/)

### Claude SDK
- [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk)
- [Building agents](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
- [Hooks reference](https://code.claude.com/docs/en/hooks)

### GitHub
- [GitHub REST API - PRs](https://docs.github.com/en/rest/pulls/pulls)
- [Linking PRs to issues](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)
