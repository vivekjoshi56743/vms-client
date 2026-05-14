import createClient, { type Middleware } from "openapi-fetch";

import { useAuthStore } from "@/stores/auth";
import type { paths } from "@/api/schema";

// Single typed entry point for the Supervision backend.
// Rule 2: components consume hooks which call functions here.
// Rule 3: `paths` is generated from swagger.json; never hand-edited.

const baseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "https://localhost:8443";

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = useAuthStore.getState().token;
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
  },
};

export const client = createClient<paths>({ baseUrl });
client.use(authMiddleware);

export class APIError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "APIError";
  }
}

// Helper to normalize openapi-fetch's { data, error, response } tuple into
// a thrown error that TanStack Query can catch.
export function unwrap<T>(result: {
  data?: T;
  error?: unknown;
  response: Response;
}): T {
  if (result.error) {
    const status = result.response.status;
    const message =
      (result.error as { error?: string } | undefined)?.error ??
      `Request failed with status ${status}`;
    throw new APIError(status, message, result.error);
  }
  if (result.data === undefined) {
    throw new APIError(
      result.response.status,
      `Request returned no body (status ${result.response.status})`
    );
  }
  return result.data;
}
