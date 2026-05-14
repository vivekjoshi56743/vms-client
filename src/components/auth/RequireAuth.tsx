import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useIsAuthenticated } from "@/hooks/useAuth";

// Route guard: any nested element bounces to /login (carrying the
// originally-requested path) when there's no valid session.

export function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthed = useIsAuthenticated();
  const location = useLocation();
  if (!isAuthed) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  return <>{children}</>;
}
