# Agent Ops Architecture

## Vertical Slice Architecture

Agent Ops follows the **Vertical Slice Architecture** pattern, organizing code by feature rather than technical layer. This approach keeps related code together, making features easier to understand, modify, and delete.

### Benefits

1. **Cohesion**: All code for a feature lives in one place
2. **Independence**: Features can evolve independently
3. **Deletability**: Remove an entire feature by deleting one folder
4. **Discoverability**: Easy to find all code related to a capability

### Feature Structure

Each feature follows this pattern:

```
features/containers/
├── handler/           # HTTP route handlers
│   └── container.handler.ts
├── services/          # Business logic
│   └── container-manager.service.ts
├── repositories/      # Data access
│   └── container.repository.ts
├── types/             # TypeScript types
│   └── container.types.ts
└── tests/             # All tests for this feature
    ├── container.handler.test.ts
    └── container-manager.service.test.ts
```

## Directory Structure

### Backend

```
backend/src/
├── features/
│   ├── agent-runtime/    # AI agent lifecycle management
│   ├── containers/       # Docker container management
│   ├── dashboard/        # Dashboard statistics
│   ├── executions/       # Execution logs and traces
│   ├── github/           # GitHub OAuth and webhooks
│   ├── llm-providers/    # LLM provider abstraction
│   ├── orchestration/    # Workflow coordination
│   ├── repositories/     # Git repository management
│   ├── templates/        # Agent template system
│   ├── work-items/       # Task tracking
│   ├── workers/          # Agent worker pool
│   └── workspaces/       # Development workspaces
├── shared/
│   ├── config.ts         # Environment configuration
│   ├── db/               # Database schema and connection
│   └── websocket/        # WebSocket hub
└── index.ts              # Application entry point
```

### Frontend

```
frontend/src/
├── components/
│   ├── containers/       # Container UI components
│   ├── settings/         # Settings components
│   └── Layout.tsx        # Main layout wrapper
├── hooks/                # React Query hooks
│   ├── use-containers.ts
│   ├── use-workers.ts
│   └── use-websocket.ts
├── mocks/                # MSW handlers for testing
├── pages/                # Route pages
├── types/                # Shared TypeScript types
└── lib/                  # Utilities (API client, etc.)
```

## Data Flow

### Request Lifecycle

1. **HTTP Request** arrives at Fastify handler
2. **Handler** validates input with Zod schemas
3. **Service** executes business logic
4. **Repository** performs database operations (Drizzle ORM)
5. **Response** is serialized and returned

### Real-time Updates

1. **Backend event** triggers (agent state change, work item update)
2. **WebSocket Hub** broadcasts message to connected clients
3. **Frontend hook** (`useRealtimeUpdates`) receives message
4. **React Query cache** is invalidated
5. **Component** re-renders with fresh data

### React Query Pattern

```typescript
// Query options factory (enables prefetching)
export const containersOptions = (filters: ContainerFilters) => queryOptions({
  queryKey: containerKeys.list(filters),
  queryFn: () => fetchContainers(filters),
  refetchInterval: 5000,
});

// Hook for components
export function useContainers(filters: ContainerFilters) {
  return useQuery(containersOptions(filters));
}
```

## Testing Strategy

### Test Pyramid

1. **Unit Tests** (majority): Test services and utilities in isolation
2. **Integration Tests** (some): Test handlers with real database
3. **Component Tests** (frontend): Test React components with mocked API

### Patterns

- **AAA Pattern**: Arrange, Act, Assert for all tests
- **In-memory SQLite**: Fast, isolated database tests
- **MSW (Mock Service Worker)**: Realistic API mocking for frontend
- **React Testing Library**: Test user behavior, not implementation

### Coverage Goals

- Backend services: 80%+ coverage
- Frontend hooks: All custom hooks tested
- Frontend components: All interactive components tested
