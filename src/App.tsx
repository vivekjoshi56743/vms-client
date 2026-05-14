import { useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { DashboardPage } from "@/pages/DashboardPage";
import { LoginPage } from "@/pages/LoginPage";
import { Playground } from "@/pages/Playground";
import { secureLoad, KEYS } from "@/lib/secure-store";
import { useAuthStore } from "@/stores/auth";
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

// Reads the session token from the OS keychain (or localStorage fallback in
// browser) and hydrates the Zustand auth store before any route renders.
// While loading we show nothing — the window is already visible so the delay
// is imperceptible (~1 frame on local disk).
function AuthInitializer({ children }: { children: React.ReactNode }) {
  const setSession = useAuthStore((s) => s.setSession);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [token, expiresAt] = await Promise.all([
          secureLoad(KEYS.token),
          secureLoad(KEYS.expiresAt),
        ]);
        if (token && expiresAt) {
          // Re-validate expiry before restoring: don't revive an expired session.
          if (Date.parse(expiresAt) > Date.now()) {
            setSession({ token, expiresAt });
          }
        }
      } finally {
        setReady(true);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return null;
  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <ThemeBootstrap />
        <AuthInitializer>
          <HashRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/playground" element={<Playground />} />
              <Route
                path="/dashboard"
                element={
                  <RequireAuth>
                    <DashboardPage />
                  </RequireAuth>
                }
              />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </HashRouter>
        </AuthInitializer>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
