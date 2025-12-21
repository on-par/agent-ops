# Quick Start Guide - Frontend API Integration

This guide will help you integrate the API layer into your existing React 19 + Vite frontend.

## Step 1: Environment Setup

Create `.env` file in the frontend directory:

```env
VITE_API_URL=/api
VITE_WS_URL=ws://localhost:3000/ws
```

## Step 2: Wrap App with Providers

Update your `src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import App from "./App.tsx";
import "./index.css";

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>
);
```

## Step 3: Enable WebSocket in App

Update your `src/App.tsx`:

```tsx
import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useAgentSocket } from "./hooks/useAgentSocket";
import { useUIStore } from "./stores/uiStore";
import { Dashboard } from "./pages/Dashboard";
import { Kanban } from "./pages/Kanban";
import { Agents } from "./pages/Agents";
import { Templates } from "./pages/Templates";
import { Settings } from "./pages/Settings";
import { Layout } from "./components/Layout";

function App() {
  const addNotification = useUIStore((state) => state.addNotification);

  // Enable WebSocket for real-time updates
  const { isConnected } = useAgentSocket({
    enabled: true,
    onConnected: () => {
      console.log("Connected to Agent Ops");
    },
    onError: (error) => {
      console.error("WebSocket error:", error);
      addNotification({
        type: "error",
        title: "Connection Error",
        message: "Failed to connect to real-time updates",
      });
    },
  });

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/kanban" element={<Kanban />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
```

## Step 4: Update Your Pages

### Example: Kanban Page with Real Data

Replace mock data in `src/pages/Kanban.tsx`:

```tsx
import { useWorkItems, useUpdateWorkItemStatus } from "../hooks";
import { useWorkItemStore } from "../stores";

export function Kanban() {
  // Fetch work items from API
  const { data: workItems, isLoading } = useWorkItems();
  const updateStatus = useUpdateWorkItemStatus();

  // Get selected item from store
  const selectedId = useWorkItemStore((state) => state.selectedItemId);
  const selectItem = useWorkItemStore((state) => state.selectItem);

  if (isLoading) {
    return <div>Loading work items...</div>;
  }

  // Group items by status
  const columns = {
    backlog: workItems?.filter((item) => item.status === "backlog") || [],
    ready: workItems?.filter((item) => item.status === "ready") || [],
    in_progress:
      workItems?.filter((item) => item.status === "in_progress") || [],
    review: workItems?.filter((item) => item.status === "review") || [],
    done: workItems?.filter((item) => item.status === "done") || [],
  };

  const handleDrop = (itemId: string, newStatus: WorkItemStatus) => {
    updateStatus.mutate({ id: itemId, status: newStatus });
  };

  // Render your Kanban board using real data...
}
```

### Example: Agents Page with Real Data

Replace mock data in `src/pages/Agents.tsx`:

```tsx
import { useWorkers, useSpawnWorker, useControlWorker } from "../hooks";
import { useTemplates } from "../hooks";

export function Agents() {
  const { data: workers, isLoading: workersLoading } = useWorkers();
  const { data: templates } = useTemplates();
  const spawnWorker = useSpawnWorker();
  const controlWorker = useControlWorker();

  const handleSpawn = async (templateId: string) => {
    try {
      await spawnWorker.mutateAsync({ templateId });
    } catch (error) {
      console.error("Failed to spawn worker:", error);
    }
  };

  const handlePause = (workerId: string) => {
    controlWorker.mutate({ id: workerId, action: { action: "pause" } });
  };

  const handleResume = (workerId: string) => {
    controlWorker.mutate({ id: workerId, action: { action: "resume" } });
  };

  // Render your agents UI using real data...
}
```

### Example: Templates Page with Real Data

Replace mock data in `src/pages/Templates.tsx`:

```tsx
import {
  useTemplates,
  useCreateTemplate,
  useDeleteTemplate,
} from "../hooks";

export function Templates() {
  const { data: templates, isLoading } = useTemplates();
  const createTemplate = useCreateTemplate();
  const deleteTemplate = useDeleteTemplate();

  const handleCreate = async () => {
    await createTemplate.mutateAsync({
      name: "New Template",
      description: "A new agent template",
      systemPrompt: "You are a helpful assistant...",
      builtinTools: ["read", "write"],
      mcpServers: [],
    });
  };

  // Render your templates UI using real data...
}
```

## Step 5: Add Notifications UI

Create a notification component in `src/components/Notifications.tsx`:

```tsx
import { useUIStore } from "../stores/uiStore";

export function Notifications() {
  const notifications = useUIStore((state) => state.notifications);
  const removeNotification = useUIStore((state) => state.removeNotification);

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {notifications.map((notif) => (
        <div
          key={notif.id}
          className={`p-4 rounded-lg shadow-lg border ${
            notif.type === "error"
              ? "bg-red-50 border-red-200"
              : notif.type === "success"
              ? "bg-green-50 border-green-200"
              : notif.type === "warning"
              ? "bg-yellow-50 border-yellow-200"
              : "bg-blue-50 border-blue-200"
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <h4 className="font-semibold">{notif.title}</h4>
              {notif.message && (
                <p className="text-sm mt-1">{notif.message}</p>
              )}
            </div>
            <button
              onClick={() => removeNotification(notif.id)}
              className="ml-4 text-gray-500 hover:text-gray-700"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

Then add it to your Layout:

```tsx
import { Notifications } from "./Notifications";

export function Layout({ children }) {
  return (
    <div>
      <Notifications />
      {/* Your existing layout */}
      {children}
    </div>
  );
}
```

## Step 6: TypeScript Configuration

Ensure your `tsconfig.json` has these settings:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

## Step 7: Install React Query DevTools (Optional but Recommended)

```bash
npm install @tanstack/react-query-devtools
```

Already included in the setup above. Press the React Query icon in the bottom-left corner of your browser to inspect queries, mutations, and cache.

## Common Patterns

### 1. Loading States

```tsx
const { data, isLoading, error } = useWorkItems();

if (isLoading) return <LoadingSpinner />;
if (error) return <ErrorMessage error={error} />;
if (!data) return <EmptyState />;

return <YourComponent data={data} />;
```

### 2. Mutations with Feedback

```tsx
const createItem = useCreateWorkItem();
const addNotification = useUIStore((state) => state.addNotification);

const handleCreate = async () => {
  try {
    await createItem.mutateAsync(data);
    addNotification({
      type: "success",
      title: "Success",
      message: "Item created successfully",
    });
  } catch (error) {
    addNotification({
      type: "error",
      title: "Error",
      message: error.message,
    });
  }
};
```

### 3. Optimistic Updates for Kanban

```tsx
const updateStatus = useUpdateWorkItemStatus();

// Drag and drop handler
const onDrop = (itemId: string, newStatus: WorkItemStatus) => {
  // UI updates immediately
  updateStatus.mutate(
    { id: itemId, status: newStatus },
    {
      onError: (error) => {
        // Rollback happens automatically
        console.error("Failed to update:", error);
      },
    }
  );
};
```

## Debugging Tips

### 1. Check React Query DevTools

Open DevTools to see:

- Query states (loading, success, error)
- Cache data
- Mutations in flight
- Refetch intervals

### 2. Check WebSocket Connection

```tsx
const { isConnected, connectionStatus } = useAgentSocket();

console.log("WebSocket:", connectionStatus); // "Connected", "Disconnected", etc.
```

### 3. Check Store State

```tsx
// Log entire store state
const workItems = useWorkItemStore();
console.log("Work Items Store:", workItems);
```

### 4. API Errors

```tsx
try {
  await api.get("/work-items");
} catch (error) {
  if (error instanceof ApiClientError) {
    console.log("Status:", error.status);
    console.log("Code:", error.code);
    console.log("Message:", error.message);
  }
}
```

## Next Steps

1. **Replace mock data** in all pages with real API hooks
2. **Add error boundaries** to catch and display errors gracefully
3. **Configure refetch intervals** based on your needs
4. **Add loading skeletons** for better UX
5. **Implement pagination** for large datasets
6. **Add filters and search** using the provided types

## Need Help?

- See complete examples in `/frontend/src/examples/IntegrationExample.tsx`
- Read full documentation in `/frontend/API_INTEGRATION.md`
- Check type definitions in `/frontend/src/types/index.ts`
- Review backend schema in `/backend/src/db/schema.ts`

## Performance Tips

1. Use `staleTime` to control how often data is refetched
2. Use `enabled` option to conditionally fetch data
3. Use optimistic updates for instant UI feedback
4. Enable WebSocket only in active views
5. Use `select` option in queries to transform data

```tsx
// Only select what you need
const workerIds = useWorkers({
  select: (data) => data.map((w) => w.id),
});
```

That's it! You now have a fully integrated frontend with type-safe API calls, real-time updates, and global state management.
