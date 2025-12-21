# Frontend API Integration Documentation

This document describes the complete API integration layer for the Agent Ops platform frontend.

## Overview

The API integration layer consists of:

1. **Type Definitions** (`src/types/index.ts`) - TypeScript interfaces matching backend schema
2. **API Client** (`src/lib/api.ts`) - Centralized fetch wrapper with error handling
3. **Zustand Stores** (`src/stores/`) - Global state management
4. **React Query Hooks** (`src/hooks/`) - Data fetching and mutations
5. **WebSocket Hook** (`src/hooks/useAgentSocket.ts`) - Real-time updates

## File Structure

```
frontend/src/
├── types/
│   └── index.ts                    # All TypeScript types and interfaces
├── lib/
│   ├── api.ts                      # API client with fetch wrapper
│   └── utils.ts                    # Utility functions (existing)
├── stores/
│   ├── index.ts                    # Barrel export
│   ├── workItemStore.ts            # Work items state
│   ├── workerStore.ts              # Workers/agents state
│   ├── templateStore.ts            # Templates state
│   └── uiStore.ts                  # UI state (modals, notifications, etc.)
├── hooks/
│   ├── index.ts                    # Barrel export
│   ├── useWorkItems.ts             # Work items CRUD hooks
│   ├── useWorkers.ts               # Workers CRUD and control hooks
│   ├── useTemplates.ts             # Templates CRUD hooks
│   ├── useTraces.ts                # Trace fetching hooks
│   └── useAgentSocket.ts           # WebSocket real-time updates
└── examples/
    └── IntegrationExample.tsx      # Complete usage example
```

## Environment Variables

Create a `.env` file in the frontend directory:

```env
VITE_API_URL=http://localhost:3000/api
VITE_WS_URL=ws://localhost:3000/ws
```

## Usage Examples

### 1. Fetching Data with React Query

```tsx
import { useWorkItems, useWorkers, useTemplates } from "@/hooks";

function MyComponent() {
  // Fetch work items
  const { data: workItems, isLoading, error } = useWorkItems();

  // Fetch workers
  const { data: workers } = useWorkers();

  // Fetch templates
  const { data: templates } = useTemplates();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {workItems?.map((item) => (
        <div key={item.id}>{item.title}</div>
      ))}
    </div>
  );
}
```

### 2. Creating and Updating Data

```tsx
import { useCreateWorkItem, useUpdateWorkItem } from "@/hooks";

function CreateWorkItemForm() {
  const createWorkItem = useCreateWorkItem();
  const updateWorkItem = useUpdateWorkItem();

  const handleCreate = async () => {
    try {
      const newItem = await createWorkItem.mutateAsync({
        title: "Implement feature X",
        type: "feature",
        description: "Add new authentication system",
        successCriteria: [
          {
            id: crypto.randomUUID(),
            description: "JWT tokens implemented",
            completed: false,
          },
        ],
      });
      console.log("Created:", newItem);
    } catch (error) {
      console.error("Failed:", error);
    }
  };

  const handleUpdate = async (id: string) => {
    await updateWorkItem.mutateAsync({
      id,
      data: {
        status: "in_progress",
      },
    });
  };

  return (
    <div>
      <button onClick={handleCreate}>Create Work Item</button>
    </div>
  );
}
```

### 3. Using Zustand Stores

```tsx
import { useWorkItemStore, useUIStore } from "@/stores";

function WorkItemList() {
  // Get state
  const items = useWorkItemStore((state) => state.items);
  const selectedId = useWorkItemStore((state) => state.selectedItemId);

  // Get actions
  const selectItem = useWorkItemStore((state) => state.selectItem);
  const addNotification = useUIStore((state) => state.addNotification);

  const handleSelect = (id: string) => {
    selectItem(id);
    addNotification({
      type: "info",
      title: "Item Selected",
      message: `Selected item ${id}`,
    });
  };

  return (
    <div>
      {items.map((item) => (
        <div
          key={item.id}
          onClick={() => handleSelect(item.id)}
          className={selectedId === item.id ? "selected" : ""}
        >
          {item.title}
        </div>
      ))}
    </div>
  );
}
```

### 4. Real-time Updates with WebSocket

```tsx
import { useAgentSocket } from "@/hooks";
import { useUIStore } from "@/stores";

function App() {
  const addNotification = useUIStore((state) => state.addNotification);

  const { isConnected, connectionStatus } = useAgentSocket({
    enabled: true,
    onConnected: () => {
      addNotification({
        type: "success",
        title: "Connected",
        message: "Real-time updates enabled",
      });
    },
    onDisconnected: () => {
      addNotification({
        type: "warning",
        title: "Disconnected",
        message: "Reconnecting...",
      });
    },
  });

  return (
    <div>
      <div>Status: {connectionStatus}</div>
      {/* Your app content */}
    </div>
  );
}
```

### 5. Worker Control

```tsx
import {
  useSpawnWorker,
  usePauseWorker,
  useResumeWorker,
  useTerminateWorker,
} from "@/hooks";

function WorkerControls({ workerId, templateId }: Props) {
  const spawnWorker = useSpawnWorker();
  const pauseWorker = usePauseWorker();
  const resumeWorker = useResumeWorker();
  const terminateWorker = useTerminateWorker();

  return (
    <div>
      <button
        onClick={() =>
          spawnWorker.mutate({
            templateId,
            workItemId: "some-work-item-id",
          })
        }
      >
        Spawn Worker
      </button>
      <button onClick={() => pauseWorker.mutate(workerId)}>Pause</button>
      <button onClick={() => resumeWorker.mutate(workerId)}>Resume</button>
      <button onClick={() => terminateWorker.mutate(workerId)}>
        Terminate
      </button>
    </div>
  );
}
```

### 6. Optimistic Updates

The `useUpdateWorkItemStatus` hook includes optimistic updates for smooth UX:

```tsx
import { useUpdateWorkItemStatus } from "@/hooks";

function KanbanCard({ item }) {
  const updateStatus = useUpdateWorkItemStatus();

  const handleDrop = (newStatus: WorkItemStatus) => {
    // UI updates immediately, then syncs with server
    updateStatus.mutate({
      id: item.id,
      status: newStatus,
    });
  };

  return <div onDrop={handleDrop}>{item.title}</div>;
}
```

### 7. Trace Monitoring

```tsx
import { useWorkerTraces, useErrorTraces } from "@/hooks";

function WorkerTraceViewer({ workerId }: { workerId: string }) {
  const { data: traces } = useWorkerTraces(workerId, 50);

  return (
    <div>
      <h3>Worker Activity</h3>
      {traces?.map((trace) => (
        <div key={trace.id}>
          <span>{trace.eventType}</span>
          <span>{trace.timestamp.toISOString()}</span>
          <pre>{JSON.stringify(trace.data, null, 2)}</pre>
        </div>
      ))}
    </div>
  );
}

function ErrorMonitor() {
  const { data: errors } = useErrorTraces(20);

  return (
    <div>
      <h3>Recent Errors</h3>
      {errors?.map((trace) => (
        <div key={trace.id} className="error">
          {trace.timestamp.toISOString()}: {JSON.stringify(trace.data)}
        </div>
      ))}
    </div>
  );
}
```

## API Client Features

The API client (`src/lib/api.ts`) provides:

- **Automatic JSON handling** - Content-Type headers and JSON parsing
- **Error handling** - Typed error responses with custom error class
- **Type safety** - Full TypeScript support with generics
- **HTTP methods** - GET, POST, PUT, PATCH, DELETE
- **Date parsing** - Automatic conversion of Unix timestamps to Date objects

### Direct API Client Usage

```tsx
import { api, ApiClientError, parseApiDates } from "@/lib/api";

// GET request
const items = await api.get<WorkItem[]>("/work-items");

// POST request
const newItem = await api.post<WorkItem>("/work-items", {
  title: "New item",
  type: "feature",
});

// Error handling
try {
  await api.delete(`/work-items/${id}`);
} catch (error) {
  if (error instanceof ApiClientError) {
    console.log(error.message);
    console.log(error.code);
    console.log(error.status); // HTTP status code
  }
}

// Parse dates from API response
const worker = parseApiDates(rawWorker, ["spawnedAt"]);
```

## Type System

All types are defined in `src/types/index.ts` and match the backend Drizzle schema:

### Core Entity Types

- `WorkItem` - Work items/tasks
- `Template` - Agent templates
- `Worker` - Running agent instances
- `Trace` - Event traces for observability

### Enum Types

- `WorkItemType`: "feature" | "bug" | "research" | "task"
- `WorkItemStatus`: "backlog" | "ready" | "in_progress" | "review" | "done"
- `WorkerStatus`: "idle" | "working" | "paused" | "error" | "terminated"
- `AgentRole`: "refiner" | "implementer" | "tester" | "reviewer"
- `TraceEventType`: "agent_state" | "work_item_update" | "tool_call" | "metric_update" | "error" | "approval_required"

### DTO Types

- `CreateWorkItemDTO` - Data for creating work items
- `UpdateWorkItemDTO` - Data for updating work items
- `CreateTemplateDTO` - Data for creating templates
- `UpdateTemplateDTO` - Data for updating templates
- `SpawnWorkerDTO` - Data for spawning workers
- `ControlWorkerDTO` - Data for controlling workers

## WebSocket Message Types

WebSocket messages follow this structure:

```typescript
interface WebSocketMessage {
  type: "agent_update" | "work_item_update" | "trace" | "error";
  payload: unknown;
}
```

### Agent Update Message

```typescript
{
  type: "agent_update",
  payload: {
    workerId: "worker-123",
    status: "working",
    metrics: {
      tokensUsed: 1500,
      costUsd: 0.045
    }
  }
}
```

### Work Item Update Message

```typescript
{
  type: "work_item_update",
  payload: {
    workItemId: "item-456",
    status: "in_progress",
    updates: {
      assignedAgents: { implementer: "worker-123" }
    }
  }
}
```

## Query Key Structure

React Query uses these query keys for caching:

```typescript
// Work Items
["workItems", "list"]
["workItems", "list", { filters }]
["workItems", "detail", itemId]

// Workers
["workers", "list"]
["workers", "detail", workerId]

// Templates
["templates", "list"]
["templates", "detail", templateId]

// Traces
["traces", "list"]
["traces", "list", { workerId }]
["traces", "list", { workItemId }]
```

## Store Architecture

Each Zustand store follows this pattern:

1. **State** - Data and selected IDs
2. **Actions** - CRUD operations
3. **Getters** - Computed/filtered data access

Stores are automatically updated by:

- React Query hooks on successful mutations
- WebSocket messages for real-time updates

## Best Practices

### 1. Use React Query for Server State

```tsx
// ✅ Good - React Query manages server state
const { data: items } = useWorkItems();

// ❌ Bad - Don't manually fetch in useEffect
useEffect(() => {
  fetch("/api/work-items").then(/* ... */);
}, []);
```

### 2. Use Zustand for UI State

```tsx
// ✅ Good - Zustand for UI state
const selectedId = useUIStore((state) => state.selectedWorkItemId);

// ❌ Bad - Don't use React Query for UI-only state
const [selectedId, setSelectedId] = useState(null);
```

### 3. Leverage Optimistic Updates

```tsx
// ✅ Good - Smooth UX with optimistic updates
updateItemStatus.mutate({ id, status: "done" });

// ❌ Bad - Waiting for server before updating UI
await updateWorkItem.mutateAsync({ id, data: { status: "done" } });
```

### 4. Handle Errors Gracefully

```tsx
const createItem = useCreateWorkItem();

if (createItem.isError) {
  return <div>Error: {createItem.error.message}</div>;
}
```

### 5. Enable WebSocket Only When Needed

```tsx
// ✅ Good - Enable only in active views
const socket = useAgentSocket({ enabled: isActiveView });

// ❌ Bad - Always enabled everywhere
const socket = useAgentSocket();
```

## Testing

See `frontend/src/__tests__/` for test examples. Key patterns:

1. Mock the API client
2. Wrap hooks in QueryClientProvider
3. Use `waitFor` for async assertions

## Performance Considerations

1. **Stale Time** - Queries have 30-60s stale time to reduce refetches
2. **Refetch Intervals** - Traces auto-refetch every 15-30s
3. **Optimistic Updates** - Immediate UI updates for better UX
4. **Query Invalidation** - Targeted invalidation to minimize refetches
5. **WebSocket** - Efficient real-time updates without polling

## Troubleshooting

### Issue: "Cannot find module '@/hooks'"

**Solution**: Check your `tsconfig.json` has path aliases:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### Issue: WebSocket not connecting

**Solution**: Check `VITE_WS_URL` environment variable and ensure backend WebSocket server is running.

### Issue: Mutations not updating UI

**Solution**: Ensure query invalidation is working. Check React Query DevTools.

### Issue: Type errors with dates

**Solution**: Use `parseApiDates()` helper to convert Unix timestamps to Date objects.

## Additional Resources

- [React Query Docs](https://tanstack.com/query/latest)
- [Zustand Docs](https://zustand-demo.pmnd.rs/)
- [react-use-websocket Docs](https://github.com/robtaussig/react-use-websocket)
- [Backend Schema](/home/user/agent-ops/backend/src/db/schema.ts)
- [Example Component](/home/user/agent-ops/frontend/src/examples/IntegrationExample.tsx)
