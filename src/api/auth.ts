import { client, unwrap } from "@/api/client";
import type { components } from "@/api/schema";

export type LoginInput = {
  username: string;
  password: string;
};

export type LoginResponse = {
  token: string;
  expiresAt: string;
};

export type CurrentUser = {
  id: string;
  username: string;
  role: string;
  created_at: string;
};

// POST /api/auth/login → { token, expires_at }
export async function login(input: LoginInput): Promise<LoginResponse> {
  const result = await client.POST("/api/auth/login", { body: input });
  const data = unwrap(result) as components["schemas"]["apitypes.LoginResponse"];
  if (!data.token || !data.expires_at) {
    throw new Error("Login response missing token or expires_at");
  }
  return { token: data.token, expiresAt: data.expires_at };
}

// POST /api/auth/logout — invalidates the current session token server-side.
// Returns 204 No Content; no body to read. Bearer auth required.
export async function logout(): Promise<void> {
  const result = await client.POST("/api/auth/logout", {});
  if (!result.response.ok && result.response.status !== 204) {
    throw new Error(`Logout failed with status ${result.response.status}`);
  }
}

// GET /api/auth/me — Bearer auth required (set by client middleware).
export async function getCurrentUser(): Promise<CurrentUser> {
  const result = await client.GET("/api/auth/me");
  const data = unwrap(result) as components["schemas"]["apitypes.UserResponse"];
  if (!data.id || !data.username || !data.role || !data.created_at) {
    throw new Error("Malformed /api/auth/me response");
  }
  return {
    id: data.id,
    username: data.username,
    role: data.role,
    created_at: data.created_at,
  };
}
