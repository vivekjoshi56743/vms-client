import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getCurrentUser, login, logout as serverLogout, type LoginInput } from "@/api/auth";
import { secureDelete, secureStore, KEYS } from "@/lib/secure-store";
import { useAuthStore } from "@/stores/auth";

// Thin mutations / queries for the auth layer. Each one does:
//   1. call the API
//   2. update the Zustand store (runtime state)
//   3. sync to the OS keychain (durable secure state)

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: LoginInput) => login(input),
    onSuccess: async ({ token, expiresAt }) => {
      // Runtime state first so queries fired immediately see the token.
      setSession({ token, expiresAt });
      // Then persist to the OS keychain — if this fails the session still
      // works for the rest of the process lifetime, but won't survive a
      // restart. The error is intentionally swallowed here; the login
      // toast in LoginForm already handles user-visible errors.
      await Promise.allSettled([
        secureStore(KEYS.token, token),
        secureStore(KEYS.expiresAt, expiresAt),
      ]);
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}

export function useLogout() {
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();
  return () => {
    // Tell the server first so the token is invalidated even if local state
    // gets out of sync. Fire-and-forget — if the network call fails the user
    // still wants to be logged out locally, so we never block the UI on it.
    void serverLogout().catch(() => { /* server may already be unreachable */ });
    logout();
    queryClient.clear();
    void Promise.allSettled([
      secureDelete(KEYS.token),
      secureDelete(KEYS.expiresAt),
    ]);
  };
}

export function useCurrentUser() {
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);

  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const user = await getCurrentUser();
      setUser(user);
      return user;
    },
    enabled: !!token,
    staleTime: 5 * 60_000,
  });
}

export function useIsAuthenticated(): boolean {
  const token = useAuthStore((s) => s.token);
  const expiresAt = useAuthStore((s) => s.expiresAt);
  if (!token) return false;
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) return false;
  return true;
}
