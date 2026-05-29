import { client, unwrap } from "@/api/client";
import type { components } from "@/api/schema";

export type Role = "owner" | "admin" | "viewer";

export type User = {
  id: string;
  username: string;
  role: Role;
  created_at: string;
};

export type CreateUserInput = {
  username: string;
  password: string;
  role: Role;
};

export type UpdateUserInput = {
  password?: string;
  role?: Role;
};

function toUser(r: components["schemas"]["apitypes.UserResponse"]): User {
  return {
    id: r.id ?? "",
    username: r.username ?? "",
    role: (r.role as Role) ?? "viewer",
    created_at: r.created_at ?? "",
  };
}

// GET /api/users — owner/admin only.
export async function getUsers(): Promise<User[]> {
  const result = await client.GET("/api/users");
  const data = unwrap(result) as components["schemas"]["apitypes.UserListResponse"];
  return (data.users ?? []).map(toUser);
}

// GET /api/users/{id} — admin/owner can fetch any user; others themselves only.
export async function getUser(id: string): Promise<User> {
  const result = await client.GET("/api/users/{id}", { params: { path: { id } } });
  return toUser(unwrap(result) as components["schemas"]["apitypes.UserResponse"]);
}

// POST /api/users — owner/admin only.
export async function createUser(input: CreateUserInput): Promise<User> {
  const result = await client.POST("/api/users", { body: input });
  return toUser(unwrap(result) as components["schemas"]["apitypes.UserResponse"]);
}

// PATCH /api/users/{id} — change password and/or role.
export async function patchUser(id: string, input: UpdateUserInput): Promise<User> {
  const result = await client.PATCH("/api/users/{id}", {
    params: { path: { id } },
    body: input,
  });
  return toUser(unwrap(result) as components["schemas"]["apitypes.UserResponse"]);
}

// DELETE /api/users/{id} — owner/admin only.
export async function deleteUser(id: string): Promise<void> {
  const result = await client.DELETE("/api/users/{id}", { params: { path: { id } } });
  if (!result.response.ok) {
    throw new Error(`Delete failed with status ${result.response.status}`);
  }
}
