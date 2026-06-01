import { useEffect, useState } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RouteErrorBoundary } from "@/components/ErrorBoundary";
import { Splash } from "@/components/layout/Splash";
import { CamerasPage } from "@/pages/CamerasPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { EventsPage } from "@/pages/EventsPage";
import { HealthPage } from "@/pages/HealthPage";
import { LivePage } from "@/pages/LivePage";
import { LoginPage } from "@/pages/LoginPage";
import { PlaybackPage } from "@/pages/PlaybackPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { UsersPage } from "@/pages/UsersPage";
import { Playground } from "@/pages/Playground";
import { useEventStream } from "@/hooks/useEventStream";
import { useIsAuthenticated } from "@/hooks/useAuth";
import { secureLoad, KEYS } from "@/lib/secure-store";
import { useAuthStore } from "@/stores/auth";
import { useUIStore } from "@/stores/ui";

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

// Surveillance mode is a focus mode for monitoring. Three behaviors:
//   1. When it turns on, jump to /live so the user is looking at video, not
//      the cameras page or wherever they were.
//   2. Escape key exits — fastest possible way to get the chrome back.
//   3. AppShell hides Sidebar/TopBar while the theme is dark-surveillance.
function SurveillanceEnforcer() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const isAuthed = useIsAuthenticated();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Only navigate when authenticated AND not already on /live. Without
    // the auth gate this enforcer fights RequireAuth: it jumps to /live,
    // RequireAuth redirects to /login, this fires again because the path
    // changed → infinite history.replaceState() loop.
    if (
      theme === "dark-surveillance" &&
      isAuthed &&
      !location.pathname.startsWith("/live")
    ) {
      navigate("/live");
    }
  }, [theme, isAuthed, navigate, location.pathname]);

  useEffect(() => {
    if (theme !== "dark-surveillance") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setTheme("dark-standard");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [theme, setTheme]);

  return null;
}

// Reads session token from the OS keychain on first mount and hydrates the
// Zustand auth store before any route renders.
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
        if (token && expiresAt && Date.parse(expiresAt) > Date.now()) {
          setSession({ token, expiresAt });
        }
      } finally {
        setReady(true);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <Splash />;
  return <>{children}</>;
}

function AuthedRoutes() {
  // Mounted only behind RequireAuth so the SSE subscription only runs while
  // the user has a valid token. Logout unmounts AuthedRoutes → hook teardown
  // closes the stream.
  useEventStream();
  return (
    <RequireAuth>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/live"      element={<LivePage />} />
        <Route path="/playback"  element={<PlaybackPage />} />
        <Route path="/events"    element={<EventsPage />} />
        <Route path="/cameras"   element={<CamerasPage />} />
        <Route path="/health"        element={<HealthPage />} />
        <Route path="/settings/users" element={<UsersPage />} />
        <Route path="/settings"      element={<SettingsPage />} />
        <Route path="*"              element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </RequireAuth>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <ThemeBootstrap />
        <AuthInitializer>
          <HashRouter>
            <SurveillanceEnforcer />
            <RouteErrorBoundary>
              <Routes>
                <Route path="/login"      element={<LoginPage />} />
                <Route path="/playground" element={<Playground />} />
                <Route path="/*"          element={<AuthedRoutes />} />
              </Routes>
            </RouteErrorBoundary>
          </HashRouter>
        </AuthInitializer>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
