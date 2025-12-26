import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Kanban } from "./pages/Kanban";
import { Agents } from "./pages/Agents";
import { Templates } from "./pages/Templates";
import { Containers } from "./pages/Containers";
import { ExecutionLogs } from "./pages/ExecutionLogs";
import { Settings } from "./pages/Settings";

// QueryClient configured with optimized cache settings for production.
// - staleTime (30s): Data considered fresh for 30 seconds, reducing redundant fetches
//   during rapid navigation. Polling queries (refetchInterval) ignore this setting.
// - gcTime (5m): Inactive queries garbage collected after 5 minutes.
// - refetchOnWindowFocus: Disabled to prevent unexpected refetches.
// - retry: Single retry on failure for resilience without excessive requests.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000,   // 30 seconds
      gcTime: 300000,     // 5 minutes
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/kanban" element={<Kanban />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/containers" element={<Containers />} />
            <Route path="/executions" element={<ExecutionLogs />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App;
