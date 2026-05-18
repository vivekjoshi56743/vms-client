import { invoke } from "@tauri-apps/api/core";

import { isTauri } from "@/lib/fingerprint";

// openapi-fetch calls our custom `fetch` implementation with a fully-built
// `Request` object as the first argument and no `init`. We must extract
// method, headers, and body from the Request object itself.
//
// In Tauri all requests route through `tofu_http_request` (Rust) so the
// pinning verifier guards HTTPS calls. For HTTP the verifier is a no-op at
// the TLS layer. In a plain browser `isTauri()` is false and we fall back
// to the global fetch.

interface TauriHttpResponse {
  status: number;
  headers: Array<[string, string]>;
  /** base64-encoded raw response bytes — see src-tauri/src/tofu.rs */
  body_b64: string;
}

// Decode a base64 string to a Uint8Array. atob() is fast enough for our
// needs (a few MB blobs at most) and avoids pulling a base64 library.
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface TauriHttpRequest {
  method: string;
  url: string;
  headers: Array<[string, string]>;
  body: string | null;
  body_is_base64: boolean;
}

function headersToArray(h: Headers): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  h.forEach((v, k) => out.push([k, v]));
  return out;
}

export const tauriFetch: typeof fetch = async (input, init) => {
  if (!isTauri()) {
    return globalThis.fetch(input as RequestInfo, init);
  }

  // Normalise: openapi-fetch passes a Request as `input` with init=undefined.
  // A plain string/URL call may also carry an `init` override — handle both.
  let url: string;
  let method: string;
  let headers: Array<[string, string]>;
  let body: string | null = null;

  if (input instanceof Request) {
    url = input.url;
    // init overrides take priority (e.g. middleware-rewritten method)
    method = (init?.method ?? input.method).toUpperCase();

    // Merge: Request headers first, then any init overrides on top.
    const merged = new Headers(input.headers);
    if (init?.headers) {
      new Headers(init.headers).forEach((v, k) => merged.set(k, v));
    }
    headers = headersToArray(merged);

    // Body: init.body takes priority; fall back to the Request's body.
    if (init?.body != null) {
      body = await bodyToString(init.body);
    } else if (input.body != null) {
      body = await input.text();
    }
  } else {
    url = typeof input === "string" ? input : input.toString();
    method = (init?.method ?? "GET").toUpperCase();
    headers = init?.headers
      ? headersToArray(new Headers(init.headers))
      : [];
    if (init?.body != null) {
      body = await bodyToString(init.body);
    }
  }

  const req: TauriHttpRequest = {
    method,
    url,
    headers,
    body,
    body_is_base64: false,
  };

  const resp = await invoke<TauriHttpResponse>("tofu_http_request", { req });

  const respHeaders = new Headers();
  for (const [k, v] of resp.headers) {
    try { respHeaders.append(k, v); } catch { /* ignore malformed headers */ }
  }
  // Rust always returns base64 raw bytes (the response may be binary — fMP4,
  // images, etc.). Decode to a Uint8Array; the Response constructor accepts
  // BufferSource. JSON callers can still .text() / .json() on this.
  const bytes = base64ToBytes(resp.body_b64);
  return new Response(bytes, { status: resp.status, headers: respHeaders });
};

async function bodyToString(body: BodyInit): Promise<string> {
  if (typeof body === "string") return body;
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
  if (ArrayBuffer.isView(body)) return new TextDecoder().decode(body);
  if (body instanceof Blob) return body.text();
  // FormData / URLSearchParams / ReadableStream — V1 only sends JSON so
  // these paths are unreachable in practice.
  throw new Error("tauriFetch: unsupported body type");
}
