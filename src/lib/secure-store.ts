import { invoke } from "@tauri-apps/api/core";

import { isTauri } from "@/lib/fingerprint";

// JS wrapper around the three Tauri keychain commands (src-tauri/src/secure_store.rs).
//
// Outside Tauri (browser dev) we fall back to localStorage with a "secure:"
// prefix so the auth flow still works end-to-end in the browser.
// The fallback is fine for development — do not rely on it for production.

export async function secureStore(key: string, value: string): Promise<void> {
  if (!isTauri()) {
    localStorage.setItem(`secure:${key}`, value);
    return;
  }
  await invoke<void>("secure_store", { key, value });
}

export async function secureLoad(key: string): Promise<string | null> {
  if (!isTauri()) {
    return localStorage.getItem(`secure:${key}`);
  }
  return invoke<string | null>("secure_load", { key });
}

export async function secureDelete(key: string): Promise<void> {
  if (!isTauri()) {
    localStorage.removeItem(`secure:${key}`);
    return;
  }
  await invoke<void>("secure_delete", { key });
}

// Stable key names — change these only if you want to invalidate all sessions.
export const KEYS = {
  token: "session:token",
  expiresAt: "session:expires_at",
} as const;
