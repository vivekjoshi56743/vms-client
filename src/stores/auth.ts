import { create } from "zustand";
import { persist } from "zustand/middleware";

// Auth store — runtime state for the current session.
//
// What lives here vs. where it's persisted:
//   token, expiresAt → OS keychain (via lib/secure-store.ts). Never in
//                       localStorage — these are credentials.
//   serverUrl        → localStorage via Zustand persist (not sensitive; lets
//                       the login form remember the last server the user typed).
//   user             → localStorage via Zustand persist (saves a /me round-trip
//                       on startup; never used for access-control decisions).
//
// On startup App.tsx's <AuthInitializer> reads the token from the keychain and
// calls setSession, hydrating the runtime state.

export interface User {
  id: string;
  username: string;
  role: string;
  created_at: string;
}

interface AuthState {
  serverUrl: string | null;
  token: string | null;
  user: User | null;
  expiresAt: string | null;
  setServer: (serverUrl: string) => void;
  setSession: (args: { token: string; expiresAt: string; user?: User | null }) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      serverUrl: null,
      token: null,
      user: null,
      expiresAt: null,
      setServer: (serverUrl) => set({ serverUrl }),
      setSession: ({ token, expiresAt, user = null }) =>
        set({ token, expiresAt, user }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null, expiresAt: null }),
    }),
    {
      name: "supervision-auth",
      // Only persist non-sensitive fields. Token + expiresAt live in the
      // OS keychain; they are hydrated at startup by AuthInitializer.
      partialize: (state) => ({
        serverUrl: state.serverUrl,
        user: state.user,
      }),
    }
  )
);
