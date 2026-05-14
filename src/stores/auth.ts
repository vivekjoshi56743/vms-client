import { create } from "zustand";
import { persist } from "zustand/middleware";

// Auth store — Bearer token + current user.
// Phase F4 (build plan) will mirror the token to Tauri secure storage; for now
// the persist middleware uses localStorage (acceptable in dev, replaced before
// shipping V1 per plan.md §F4).

export interface User {
  id: string;
  username: string;
  role: string;
  created_at: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  expiresAt: string | null;
  setSession: (args: { token: string; expiresAt: string; user?: User | null }) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      expiresAt: null,
      setSession: ({ token, expiresAt, user = null }) =>
        set({ token, expiresAt, user }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null, expiresAt: null }),
    }),
    { name: "supervision-auth" }
  )
);
