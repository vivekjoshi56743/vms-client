import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Playground } from "@/pages/Playground";
import { useUIStore } from "@/stores/ui";

// Provider tree, per plan.md §6:
//   QueryClient → HashRouter → Toaster (top-level sibling)
// HashRouter chosen because it's the most reliable across WebView2,
// WKWebView, and WebKitGTK (plan.md §1).

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function ThemeBootstrap() {
  // The persist middleware's onRehydrateStorage applies the stored theme
  // synchronously on rehydrate. This effect handles the first paint when
  // no persisted theme exists yet (fresh install).
  const theme = useUIStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme === "light" ? "light" : "dark");
    root.setAttribute(
      "data-mode",
      theme === "dark-surveillance" ? "surveillance" : "standard"
    );
  }, [theme]);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <ThemeBootstrap />
        <HashRouter>
          <Routes>
            <Route path="/playground" element={<Playground />} />
            <Route path="*" element={<Navigate to="/playground" replace />} />
          </Routes>
        </HashRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
