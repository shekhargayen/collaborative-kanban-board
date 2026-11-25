import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { TaskActionsProvider } from "./hooks/useTaskActions";
import { sync } from "./lib/sync";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    // Realtime keeps the board fresh; we refetch on SSE (re)connect / resync instead of on focus.
    queries: { retry: 2, staleTime: Infinity, refetchOnWindowFocus: false },
    // No automatic retries: a failed write is rolled back and the user can hit "Retry" on the toast.
    mutations: { retry: 0 },
  },
});
sync.attach(queryClient);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TaskActionsProvider>
          <App />
        </TaskActionsProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
