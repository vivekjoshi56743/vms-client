import createClient, { type Middleware } from "openapi-fetch";

import { useAuthStore } from "@/stores/auth";
import { tauriFetch } from "@/api/tauri-fetch";
import type { paths } from "@/api/schema";

// Single typed entry point for the Supervision backend.
// Rule 2: components consume hooks which call functions here.
// Rule 3: `paths` is generated from docs/swagger.json; never hand-edited.
//
// Inside Tauri all requests are routed via `tauriFetch` → `tofu_http_request`
// (src-tauri/src/tofu.rs) so the pinned-fingerprint rustls verifier actually
// applies. In a plain browser dev session, `tauriFetch` falls back to the
// global fetch and you'll need a backend with a browser-trusted cert.

const DEFAULT_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://localhost:8443";

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const { token, serverUrl } = useAuthStore.getState();
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    // Rewrite the URL to point at the user-selected server. openapi-fetch
    // builds the URL from `baseUrl + path`, but we want one client whose
    // base URL tracks the auth store (so changing servers doesn't need a
    // QueryClient reset). We swap origin here.
    if (serverUrl) {
      const desired = new URL(serverUrl);
      const current = new URL(request.url);
      if (current.origin !== desired.origin) {
        const rewritten = new URL(
          current.pathname + current.search + current.hash,
          desired
        );
        return new Request(rewritten, request);
      }
    }
    return request;
  },
};

export const client = createClient<paths>({
  baseUrl: DEFAULT_BASE_URL,
  fetch: tauriFetch,
});
client.use(authMiddleware);

export function getActiveServerUrl(): string {
  return useAuthStore.getState().serverUrl ?? DEFAULT_BASE_URL;
}

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
