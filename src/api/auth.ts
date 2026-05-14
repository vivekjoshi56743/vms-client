import { client, unwrap } from "@/api/client";

export interface LoginInput {
  username: string;
  password: string;
}

// POST /api/auth/login → { token, expires_at }
export async function login(input: LoginInput) {
  const result = await client.POST("/api/auth/login", {
    body: input,
  });
  return unwrap(result);
}

// GET /api/auth/me — Bearer auth required (set by client middleware).
export async function getCurrentUser() {
  const result = await client.GET("/api/auth/me");
  return unwrap(result);
}
