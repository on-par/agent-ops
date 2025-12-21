# Agent Ops: Implementation Plan v2

This plan is structured for delegation to Claude Code agents. Each task is self-contained with clear inputs, outputs, and success criteria.

---

## Development Standards

### Code Quality
- **SOLID principles** in all service and module design
- **Clean Code** standards for naming, function size, and organization
- **DRY** – Extract shared logic, use generics where appropriate

### Test-Driven Development
- Write tests BEFORE implementation (Red-Green-Refactor)
- Each task includes test requirements
- Minimum coverage: 80% for services, 90% for critical paths

### Task Execution Pattern
1. Read and understand requirements
2. Write failing tests for success criteria
3. Implement minimal code to pass tests
4. Refactor for clarity and quality
5. Verify all tests pass

---

## Phase 1: Project Setup & Core Models

### Task 1.1: Initialize Backend Project
**Role:** Implementer  
**Description:** Set up the TypeScript backend project with Fastify, proper structure, and dependencies.

**Success Criteria:**
- [ ] Create `backend/` directory with structure from design doc
- [ ] Create `package.json` with dependencies: fastify, @fastify/websocket, zod, drizzle-orm, better-sqlite3, @anthropic-ai/claude-code, vitest
- [ ] Create `tsconfig.json` with strict mode enabled
- [ ] Create `src/index.ts` and `src/app.ts` with minimal Fastify app
- [ ] Create `src/config.ts` with typed config (ANTHROPIC_API_KEY, DATABASE_URL, etc.)
- [ ] Configure ESLint + Prettier
- [ ] Server starts with `pnpm dev`
- [ ] Health endpoint `GET /health` returns `{"status": "ok"}`
- [ ] Test: Health endpoint returns 200

**Linked Files:** None (greenfield)

---

### Task 1.2: Initialize Frontend Project
**Role:** Implementer  
**Description:** Set up the React frontend with Vite, TypeScript, Tailwind, and shadcn/ui.

**Success Criteria:**
- [ ] Create `frontend/` directory using `pnpm create vite@latest frontend -- --template react-ts`
- [ ] Install and configure Tailwind CSS
- [ ] Install shadcn/ui and initialize with `pnpm dlx shadcn-ui@latest init`
- [ ] Install dependencies: @tanstack/react-query, zustand, recharts, react-use-websocket
- [ ] Configure Vitest + React Testing Library
- [ ] Create basic App.tsx with routing placeholder
- [ ] Dev server runs with `pnpm dev`
- [ ] Test: App renders without errors

**Linked Files:** None (greenfield)

---

### Task 1.3: Define Core Zod Schemas
**Role:** Implementer  
**Description:** Create all Zod schemas for work items, templates, workers, and traces.

**Success Criteria:**
- [ ] Create `src/models/work-item.ts` with WorkItemSchema, SuccessCriterionSchema, Transition, WorkItemStatus
- [ ] Create `src/models/template.ts` with AgentTemplateSchema, MCPServerConfigSchema, AgentRole, PermissionMode
- [ ] Create `src/models/worker.ts` with AgentWorkerSchema, WorkerStatus
- [ ] Create `src/models/trace.ts` with TraceEventSchema, TraceEventType
- [ ] All schemas use proper Zod types with sensible defaults
- [ ] Create `src/models/index.ts` exporting all schemas and types
- [ ] Test: Schema validation accepts valid data
- [ ] Test: Schema validation rejects invalid data with clear errors

**Linked Files:** `agent-ops-design-v3.md` (Data Model sections)

---

### Task 1.4: Set Up SQLite Database Layer
**Role:** Implementer  
**Description:** Create Drizzle ORM database layer for persistence.

**Success Criteria:**
- [ ] Create `src/db/index.ts` with database connection setup
- [ ] Create `src/db/schema.ts` with Drizzle tables: workItems, templates, workers, traces, workflowConfig
- [ ] Create migration system with `drizzle-kit`
- [ ] Create `src/repositories/base.repository.ts` with generic CRUD pattern
- [ ] Implement `src/repositories/work-item.repository.ts`
- [ ] Implement `src/repositories/template.repository.ts`
- [ ] Implement `src/repositories/worker.repository.ts`
- [ ] Database initializes on app startup
- [ ] Test: CRUD operations work correctly
- [ ] Test: Repository methods handle errors gracefully

**Linked Files:** `src/models/`

---

## Phase 2: Work Item Management

### Task 2.1: Work Item Service
**Role:** Implementer  
**Description:** Implement business logic layer for work items following SOLID principles.

**Success Criteria:**
- [ ] Create `src/services/work-item.service.ts`
- [ ] Implement `WorkItemService` class with dependency injection for repository
- [ ] Methods: create, findById, findAll, update, delete
- [ ] Implement filtering by status and type
- [ ] Validate work item data using Zod schemas
- [ ] Test: All CRUD operations
- [ ] Test: Filtering works correctly
- [ ] Test: Invalid data rejected with ValidationError

**Linked Files:** `src/models/work-item.ts`, `src/repositories/work-item.repository.ts`

---

### Task 2.2: Work Item API Endpoints
**Role:** Implementer  
**Description:** Implement REST API for work item CRUD and transitions.

**Success Criteria:**
- [ ] Create `src/routes/work-items.routes.ts` with Fastify route plugin
- [ ] `POST /api/work-items` - create work item
- [ ] `GET /api/work-items` - list with filters (status, type)
- [ ] `GET /api/work-items/:id` - get single item
- [ ] `PATCH /api/work-items/:id` - update item
- [ ] `DELETE /api/work-items/:id` - delete item
- [ ] `POST /api/work-items/:id/transition` - move to next status
- [ ] All endpoints have proper error handling and validation
- [ ] Register routes in app.ts
- [ ] Test: Each endpoint returns correct status codes
- [ ] Test: Validation errors return 400 with details
- [ ] Test: Not found returns 404

**Linked Files:** `src/services/work-item.service.ts`

---

### Task 2.3: Workflow Engine Service
**Role:** Implementer  
**Description:** Implement workflow logic for transitions and approval gates.

**Success Criteria:**
- [ ] Create `src/services/workflow-engine.service.ts`
- [ ] Implement `WorkflowEngineService` class
- [ ] Load/save WorkflowConfig from database
- [ ] Implement `canTransition(item, targetStatus): ValidationResult`
- [ ] Implement `executeTransition(item, targetStatus, approvedBy): WorkItem`
- [ ] Enforce approval gates from config
- [ ] Emit events on transitions (prepare for WebSocket)
- [ ] Handle rework (Review → In Progress)
- [ ] Test: Valid transitions succeed
- [ ] Test: Invalid transitions fail with reason
- [ ] Test: Approval gates block when required
- [ ] Test: Approval gates pass when not required

**Linked Files:** `src/models/work-item.ts`, `agent-ops-design-v3.md` (Workflow Engine section)

---

### Task 2.4: Kanban Board Frontend
**Role:** Implementer  
**Description:** Build the Kanban board UI component.

**Success Criteria:**
- [ ] Create `src/components/KanbanBoard/` directory
- [ ] Implement `KanbanColumn.tsx` (Backlog, Ready, In Progress, Review, Done)
- [ ] Implement `WorkItemCard.tsx` with status, title, type badge
- [ ] Implement drag-and-drop between columns (using @dnd-kit)
- [ ] Show approval required indicator on blocked items
- [ ] Create `WorkItemModal.tsx` for viewing/editing details
- [ ] Create `CreateWorkItemForm.tsx`
- [ ] Connect to API with React Query
- [ ] Create `src/api/work-items.ts` with typed API client
- [ ] Test: Columns render with correct items
- [ ] Test: Drag and drop triggers transition API
- [ ] Test: Modal opens with item details

**Linked Files:** `src/api/work-items.ts`

---

## Phase 3: Agent Templates

### Task 3.1: Template Service
**Role:** Implementer  
**Description:** Implement business logic for template management.

**Success Criteria:**
- [ ] Create `src/services/template.service.ts`
- [ ] Implement `TemplateService` class with DI
- [ ] Methods: create, findById, findAll, update, delete
- [ ] Protect system templates from modification
- [ ] Implement `findByRole(role): AgentTemplate`
- [ ] Test: CRUD operations
- [ ] Test: System templates cannot be updated/deleted
- [ ] Test: User templates can be modified

**Linked Files:** `src/models/template.ts`, `src/repositories/template.repository.ts`

---

### Task 3.2: Template API Endpoints
**Role:** Implementer  
**Description:** Implement REST API for agent template management.

**Success Criteria:**
- [ ] Create `src/routes/templates.routes.ts` with Fastify route plugin
- [ ] `GET /api/templates` - list all templates (system + user)
- [ ] `POST /api/templates` - create custom template
- [ ] `GET /api/templates/:id` - get template details
- [ ] `PATCH /api/templates/:id` - update template (user-created only)
- [ ] `DELETE /api/templates/:id` - delete template (user-created only)
- [ ] Register routes in app.ts
- [ ] Test: List returns both system and user templates
- [ ] Test: Cannot modify system templates (403)
- [ ] Test: CRUD works for user templates

**Linked Files:** `src/services/template.service.ts`

---

### Task 3.3: Built-in Template Registry
**Role:** Implementer  
**Description:** Create system for loading and managing built-in templates.

**Success Criteria:**
- [ ] Create `src/services/template-registry.service.ts`
- [ ] Create `src/templates/` directory with YAML files for Refiner, Implementer, Tester, Reviewer
- [ ] Load built-in templates on startup using `js-yaml`
- [ ] Mark built-in templates with `createdBy: "system"`
- [ ] Implement `getDefaultTemplateForRole(role): AgentTemplate`
- [ ] Support MCP server configuration in templates
- [ ] Test: Templates load correctly on startup
- [ ] Test: getDefaultTemplateForRole returns correct template

**Linked Files:** `agent-ops-design-v3.md` (Built-in Templates section)

---

### Task 3.4: Template Editor Frontend
**Role:** Implementer  
**Description:** Build UI for viewing and creating agent templates.

**Success Criteria:**
- [ ] Create `src/components/TemplateEditor/` directory
- [ ] Implement `TemplateList.tsx` showing all templates
- [ ] Implement `TemplateCard.tsx` with name, description, role badge
- [ ] Implement `TemplateForm.tsx` for creating/editing templates
- [ ] Form fields: name, description, systemPrompt, permissionMode, tools, MCP servers
- [ ] `MCPServerForm.tsx` sub-component (add/remove servers)
- [ ] Read-only view for built-in templates
- [ ] Create `src/api/templates.ts` with typed API client
- [ ] Test: List renders templates correctly
- [ ] Test: Form validates required fields
- [ ] Test: System templates show read-only view

**Linked Files:** `src/api/templates.ts`

---

## Phase 4: Worker Pool & Agent Execution

### Task 4.1: Worker Pool Service
**Role:** Implementer  
**Description:** Implement worker pool management with concurrency limits.

**Success Criteria:**
- [ ] Create `src/services/worker-pool.service.ts`
- [ ] Implement `WorkerPoolService` class (Singleton pattern)
- [ ] Configurable maxWorkers from config
- [ ] Implement `spawnWorker(templateId): Promise<AgentWorker>`
- [ ] Implement `terminateWorker(workerId): Promise<void>`
- [ ] Implement `getAvailableWorker(role): AgentWorker | null`
- [ ] Implement work queue for when pool is full
- [ ] Track worker metrics (context window, tokens, cost)
- [ ] Test: Spawn respects maxWorkers limit
- [ ] Test: Queue processes when worker becomes available
- [ ] Test: Terminate cleans up worker state

**Linked Files:** `src/models/worker.ts`

---

### Task 4.2: Agent Manager Service  
**Role:** Implementer  
**Description:** Bridge between worker pool and Claude Agent SDK.

**Success Criteria:**
- [ ] Create `src/services/agent-manager.service.ts`
- [ ] Implement `AgentManagerService` class
- [ ] Initialize SDK client from template config
- [ ] Implement `startAgentWork(worker, workItem, role): Promise<void>`
- [ ] Build context prompt from work item spec + success criteria
- [ ] Handle agent completion and status updates
- [ ] Implement pause/resume using SDK hooks
- [ ] Implement context injection
- [ ] Track context window usage from SDK responses
- [ ] Test: Agent starts with correct configuration
- [ ] Test: Pause/resume changes worker state
- [ ] Test: Completion updates work item status

**Linked Files:** `src/services/worker-pool.service.ts`, `src/hooks/`

---

### Task 4.3: SDK Hooks for Observability
**Role:** Implementer  
**Description:** Implement Claude SDK hooks for tracing and control.

**Success Criteria:**
- [ ] Create `src/hooks/trace.hook.ts`
- [ ] Capture tool calls (name, inputs, outputs, duration)
- [ ] Capture token usage per turn
- [ ] Calculate cost from token usage (configurable rates)
- [ ] Emit TraceEvents to observability service
- [ ] Create `src/hooks/pause.hook.ts`
- [ ] Implement pause check in PreToolUse hook
- [ ] Implement context injection on resume
- [ ] Test: Tool calls emit trace events
- [ ] Test: Pause hook blocks execution when paused
- [ ] Test: Resume injects context correctly

**Linked Files:** `src/models/trace.ts`, `agent-ops-design-v3.md` (Hooks section)

---

### Task 4.4: Worker API Endpoints
**Role:** Implementer  
**Description:** Implement REST API for worker control.

**Success Criteria:**
- [ ] Create `src/routes/workers.routes.ts` with Fastify route plugin
- [ ] `GET /api/workers` - list active workers
- [ ] `GET /api/workers/:id` - get worker details with metrics
- [ ] `POST /api/workers/:id/pause` - pause worker
- [ ] `POST /api/workers/:id/resume` - resume worker (optional context)
- [ ] `POST /api/workers/:id/terminate` - terminate worker
- [ ] `POST /api/workers/:id/inject` - inject context without pausing
- [ ] Register routes in app.ts
- [ ] Test: List returns all active workers
- [ ] Test: Pause/resume changes worker status
- [ ] Test: Terminate removes worker from pool

**Linked Files:** `src/services/worker-pool.service.ts`, `src/services/agent-manager.service.ts`

---

### Task 4.5: Work Assignment Service
**Role:** Implementer  
**Description:** Connect work items to workers for automatic assignment.

**Success Criteria:**
- [ ] Create `src/services/work-assignment.service.ts`
- [ ] Implement `WorkAssignmentService` class with DI
- [ ] Implement `assignWork(workItemId, role): Promise<AssignmentResult>`
- [ ] Find or spawn appropriate worker
- [ ] Queue work if pool is full
- [ ] Process queue when workers become available (event-driven)
- [ ] Update work item with assigned agent ID
- [ ] Add `POST /api/work-items/:id/assign` endpoint
- [ ] Test: Assignment finds available worker
- [ ] Test: Assignment spawns new worker when pool has capacity
- [ ] Test: Assignment queues when pool is full

**Linked Files:** `src/services/worker-pool.service.ts`, `src/services/workflow-engine.service.ts`

---

## Phase 5: Real-time & Observability

### Task 5.1: WebSocket Hub
**Role:** Implementer  
**Description:** Implement WebSocket server for real-time updates.

**Success Criteria:**
- [ ] Create `src/services/websocket-hub.service.ts`
- [ ] Implement `WebSocketHubService` class (Singleton)
- [ ] Connection management: connect, disconnect, list
- [ ] Implement `broadcast(event: ServerEvent): void`
- [ ] Implement `sendTo(clientId, event): void`
- [ ] Create `src/routes/ws.routes.ts` with WebSocket endpoint
- [ ] Handle incoming ClientCommands
- [ ] Route commands to appropriate services
- [ ] Test: Connections are tracked
- [ ] Test: Broadcast sends to all clients
- [ ] Test: Commands route correctly

**Linked Files:** `agent-ops-design-v3.md` (WebSocket section)

---

### Task 5.2: Observability Service
**Role:** Implementer  
**Description:** Centralized collection and broadcasting of trace events.

**Success Criteria:**
- [ ] Create `src/services/observability.service.ts`
- [ ] Implement `ObservabilityService` class (Singleton)
- [ ] Collect events from SDK hooks
- [ ] Store events in traces table
- [ ] Broadcast events via WebSocket hub
- [ ] Aggregate metrics (tokens, cost, latency)
- [ ] Implement retention policy (configurable, default 1000 events)
- [ ] Test: Events are stored correctly
- [ ] Test: Events broadcast to WebSocket clients
- [ ] Test: Retention policy removes old events

**Linked Files:** `src/models/trace.ts`, `src/services/websocket-hub.service.ts`

---

### Task 5.3: Metrics API Endpoints
**Role:** Implementer  
**Description:** Implement dashboard metrics endpoints.

**Success Criteria:**
- [ ] Create `src/routes/metrics.routes.ts` with Fastify route plugin
- [ ] `GET /api/metrics/agents` - active count, status breakdown, utilization
- [ ] `GET /api/metrics/work` - items by status, cycle time, throughput
- [ ] `GET /api/metrics/system` - queue depth, error rate, API usage
- [ ] `GET /api/traces` - paginated trace events
- [ ] `GET /api/traces/:workerId` - traces for specific worker
- [ ] Register routes in app.ts
- [ ] Test: Metrics return correct aggregations
- [ ] Test: Traces pagination works

**Linked Files:** `src/services/observability.service.ts`, `src/repositories/`

---

### Task 5.4: WebSocket Client Hook (Frontend)
**Role:** Implementer  
**Description:** Create React hook for WebSocket connection.

**Success Criteria:**
- [ ] Create `src/hooks/useAgentOpsSocket.ts`
- [ ] Connect to WebSocket on mount
- [ ] Parse incoming ServerEvents
- [ ] Route events to appropriate Zustand stores
- [ ] Implement `sendCommand(command: ClientCommand): void`
- [ ] Handle reconnection with exponential backoff
- [ ] Provide connection status
- [ ] Test: Events update correct stores
- [ ] Test: Commands send correctly
- [ ] Test: Reconnection attempts on disconnect

**Linked Files:** `src/stores/`

---

### Task 5.5: Zustand Stores (Frontend)
**Role:** Implementer  
**Description:** Create state management stores for real-time data.

**Success Criteria:**
- [ ] Create `src/stores/workItemStore.ts` - work items state
- [ ] Create `src/stores/workerStore.ts` - workers state with metrics
- [ ] Create `src/stores/traceStore.ts` - trace events (ring buffer, max 1000)
- [ ] Create `src/stores/metricsStore.ts` - aggregated metrics
- [ ] Stores update from WebSocket events
- [ ] Stores sync with API on initial load
- [ ] Test: Store updates on WebSocket events
- [ ] Test: Initial load populates stores

**Linked Files:** `src/hooks/useAgentOpsSocket.ts`

---

## Phase 6: Dashboard UI

### Task 6.1: Dashboard Layout
**Role:** Implementer  
**Description:** Create main dashboard layout with navigation.

**Success Criteria:**
- [ ] Create `src/components/Dashboard/DashboardLayout.tsx`
- [ ] Implement sidebar navigation: Dashboard, Kanban, Agents, Templates
- [ ] Implement header with system status indicator
- [ ] Create responsive layout (collapsible sidebar on mobile)
- [ ] Set up React Router with routes for each section
- [ ] Test: Navigation changes routes
- [ ] Test: Layout responsive on mobile

**Linked Files:** `src/App.tsx`

---

### Task 6.2: Dashboard Overview Page
**Role:** Implementer  
**Description:** Build the main dashboard overview with key metrics.

**Success Criteria:**
- [ ] Create `src/components/Dashboard/DashboardOverview.tsx`
- [ ] Implement `MetricCard.tsx` component
- [ ] Display: Active Agents, Items in Progress, Queue Depth, Today's Cost
- [ ] Implement work items by status chart (using Recharts)
- [ ] Implement `ActivityFeed.tsx` (last 10 events)
- [ ] Implement `AgentStatusGrid.tsx` (thumbnails with status indicators)
- [ ] Auto-refresh from Zustand stores (WebSocket-driven)
- [ ] Test: Metrics display correctly
- [ ] Test: Activity feed updates on new events

**Linked Files:** `src/stores/metricsStore.ts`, `src/stores/workerStore.ts`

---

### Task 6.3: Agent Panel
**Role:** Implementer  
**Description:** Build detailed agent monitoring panel.

**Success Criteria:**
- [ ] Create `src/components/AgentPanel/` directory
- [ ] Implement `AgentList.tsx` with status, current task, metrics
- [ ] Implement `AgentDetail.tsx` with:
  - Context window usage bar (warn at 80%)
  - Token/cost counters
  - Tool call history (collapsible)
  - Pause/Resume/Terminate buttons
  - Context injection textarea
- [ ] Real-time streaming of agent output
- [ ] Connect to WebSocket for live updates
- [ ] Test: List shows all workers
- [ ] Test: Detail view updates in real-time
- [ ] Test: Control buttons trigger API calls

**Linked Files:** `src/stores/workerStore.ts`, `src/stores/traceStore.ts`

---

### Task 6.4: Metrics Charts
**Role:** Implementer  
**Description:** Build time-series charts for metrics visualization.

**Success Criteria:**
- [ ] Create `src/components/Dashboard/MetricsCharts.tsx`
- [ ] Implement token usage over time chart (Recharts Line)
- [ ] Implement cost over time chart
- [ ] Implement throughput chart (items completed per hour)
- [ ] Implement agent utilization chart
- [ ] Time range selector (1h, 6h, 24h, 7d)
- [ ] Test: Charts render with data
- [ ] Test: Time range changes data displayed

**Linked Files:** `src/stores/metricsStore.ts`

---

## Phase 7: Configuration & Polish

### Task 7.1: Configuration API & UI
**Role:** Implementer  
**Description:** Implement workflow and pool configuration.

**Success Criteria:**
- [ ] Create `src/routes/config.routes.ts` with Fastify route plugin
- [ ] `GET /api/config/workflow` - get approval gate settings
- [ ] `PATCH /api/config/workflow` - update approval gates
- [ ] `GET /api/config/pool` - get max_workers, etc.
- [ ] `PATCH /api/config/pool` - update pool settings
- [ ] Create `src/components/Settings/WorkflowSettings.tsx`
- [ ] Toggle switches for each approval gate
- [ ] Create `src/components/Settings/PoolSettings.tsx`
- [ ] Number input for max_workers
- [ ] Test: Config changes persist
- [ ] Test: UI reflects current config

**Linked Files:** `src/services/workflow-engine.service.ts`, `src/services/worker-pool.service.ts`

---

### Task 7.2: Error Handling & Recovery
**Role:** Implementer  
**Description:** Implement robust error handling throughout the system.

**Success Criteria:**
- [ ] Create `src/errors/index.ts` with custom error classes (ValidationError, NotFoundError, etc.)
- [ ] Add global error handler in Fastify
- [ ] Handle agent crashes gracefully (update worker status, notify UI)
- [ ] Implement retry logic for transient API failures
- [ ] Add error state to work items with error details
- [ ] Create `src/components/common/ErrorBoundary.tsx`
- [ ] Show error notifications in UI (toast)
- [ ] Test: Errors return correct HTTP status
- [ ] Test: Agent crash updates worker status
- [ ] Test: UI shows error notifications

**Linked Files:** All service files

---

### Task 7.3: Docker Compose Setup
**Role:** Implementer  
**Description:** Create Docker setup for local development.

**Success Criteria:**
- [ ] Create `backend/Dockerfile` (Node 20 LTS)
- [ ] Create `frontend/Dockerfile`
- [ ] Create `docker-compose.yml` with backend, frontend services
- [ ] Volume mounts for hot reload in development
- [ ] Environment variable configuration
- [ ] `docker-compose up` starts full stack
- [ ] Document in README.md

**Linked Files:** Project root

---

### Task 7.4: Documentation & README
**Role:** Implementer  
**Description:** Create comprehensive documentation.

**Success Criteria:**
- [ ] Update `README.md` with:
  - Project overview
  - Getting started guide
  - Development setup
  - Architecture overview
- [ ] Create `docs/api.md` - API endpoint reference
- [ ] Create `docs/websocket.md` - WebSocket events and commands
- [ ] Create `docs/configuration.md` - All configuration options
- [ ] Create `docs/troubleshooting.md` - Common issues and solutions

**Linked Files:** Project root

---

## Task Dependencies

```
Phase 1: Setup (can run in parallel)
├── 1.1 Backend Setup
├── 1.2 Frontend Setup  
├── 1.3 Core Models (after 1.1)
└── 1.4 Database Layer (after 1.3)

Phase 2: Work Items (after Phase 1)
├── 2.1 Work Item Service (after 1.4)
├── 2.2 Work Item API (after 2.1)
├── 2.3 Workflow Engine (after 2.1)
└── 2.4 Kanban Board UI (after 1.2, parallel with 2.1-2.3)

Phase 3: Templates (after Phase 1)
├── 3.1 Template Service (after 1.4)
├── 3.2 Template API (after 3.1)
├── 3.3 Template Registry (after 3.1)
└── 3.4 Template Editor UI (after 1.2, parallel with 3.1-3.3)

Phase 4: Workers (after Phase 2 & 3)
├── 4.1 Worker Pool (after 1.4)
├── 4.2 Agent Manager (after 4.1, 3.3)
├── 4.3 SDK Hooks (after 4.2)
├── 4.4 Worker API (after 4.1)
└── 4.5 Work Assignment (after 4.2, 2.3)

Phase 5: Real-time (after Phase 4)
├── 5.1 WebSocket Hub (after 1.1)
├── 5.2 Observability (after 4.3, 5.1)
├── 5.3 Metrics API (after 5.2)
├── 5.4 WebSocket Client (after 1.2)
└── 5.5 Zustand Stores (after 5.4)

Phase 6: Dashboard (after Phase 5)
├── 6.1 Dashboard Layout (after 1.2)
├── 6.2 Dashboard Overview (after 5.5, 6.1)
├── 6.3 Agent Panel (after 5.5, 6.1)
└── 6.4 Metrics Charts (after 5.5, 6.1)

Phase 7: Polish (after Phase 6)
├── 7.1 Configuration (after all)
├── 7.2 Error Handling (after all)
├── 7.3 Docker Setup (after all)
└── 7.4 Documentation (after all)
```

---

## Delegation Template

When assigning tasks to Claude Code agents, use this template:

```markdown
## Task: [Task Number] - [Task Name]

### Context
Read the design document at `agent-ops-design-v3.md` for full architecture context.

### Development Standards
- Follow TDD: Write tests BEFORE implementation
- Apply SOLID principles
- Follow Clean Code standards
- Keep functions small and focused
- Use meaningful names

### Success Criteria
[Copy success criteria from task]

### Reference Files
[List any existing files to reference]

### Testing Requirements
- Write unit tests for all business logic
- Use Vitest for testing
- Aim for >80% coverage on new code
- Run `pnpm test` before marking complete

### Deliverables
1. Implementation code
2. Passing tests
3. Any necessary documentation updates
```

---

## Example Delegation Prompt

```markdown
## Task: 2.1 - Work Item Service

### Context
Read the design document at `agent-ops-design-v3.md` for full architecture context.

### Development Standards
- Follow TDD: Write tests BEFORE implementation
- Apply SOLID principles
- Follow Clean Code standards
- Keep functions small and focused
- Use meaningful names

### Success Criteria
- [ ] Create `src/services/work-item.service.ts`
- [ ] Implement `WorkItemService` class with dependency injection for repository
- [ ] Methods: create, findById, findAll, update, delete
- [ ] Implement filtering by status and type
- [ ] Validate work item data using Zod schemas
- [ ] Test: All CRUD operations
- [ ] Test: Filtering works correctly
- [ ] Test: Invalid data rejected with ValidationError

### Reference Files
- `src/models/work-item.ts`
- `src/repositories/work-item.repository.ts`

### Testing Requirements
- Write unit tests for all business logic
- Use Vitest for testing
- Aim for >80% coverage on new code
- Run `pnpm test` before marking complete

### Deliverables
1. `src/services/work-item.service.ts`
2. `src/services/__tests__/work-item.service.test.ts`
3. Any type updates needed
```
