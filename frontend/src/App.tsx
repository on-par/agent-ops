import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Kanban } from "./pages/Kanban";
import { Agents } from "./pages/Agents";
import { Templates } from "./pages/Templates";
import { Containers } from "./pages/Containers";
import { ExecutionLogs } from "./pages/ExecutionLogs";
import { Settings } from "./pages/Settings";

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
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
    </QueryClientProvider>
  );
}

export default App;
