import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { isTauri } from "@/lib/fingerprint";

// Envelope shape emitted by the backend.
// Topic format: 4 dot-separated segments. Currently:
//   camera.<id>.stream.<state>
//   camera.<id>.health.changed
//   recording.<id>.segment.<state>
export interface EventEnvelope {
  topic: string;
  data?: unknown;
}

export interface ParsedEvent {
  topic: string;
  domain: string;          // "camera" | "recording" | ...
  id: string;              // camera or recording id
  kind: string;            // "stream" | "health" | "segment" | ...
  state: string;           // "changed" | "started" | "stopped" | ...
  data: unknown;
}

function parse(raw: string): ParsedEvent | null {
  let envelope: EventEnvelope;
  try {
    envelope = JSON.parse(raw);
  } catch {
    // eslint-disable-next-line no-console
    console.warn("sse-event: non-JSON payload", raw);
    return null;
  }
  if (!envelope || typeof envelope.topic !== "string") return null;
  const parts = envelope.topic.split(".");
  if (parts.length < 4) {
    // Unknown topic shape — surface for debugging but don't route.
    return null;
  }
  const [domain, id, kind, ...rest] = parts as [string, string, string, ...string[]];
  return {
    topic: envelope.topic,
    domain,
    id,
    kind,
    state: rest.join("."),
    data: envelope.data,
  };
}

// Asks the Rust SSE bridge to open a stream. Idempotent — calling start while
// a previous stream is running replaces it (Rust aborts the old task).
export async function startEventStream(opts: {
  token: string;
  serverUrl: string;
  pattern?: string;
}): Promise<void> {
  if (!isTauri()) return; // dev-browser fallback: no streaming
  await invoke("events_start", {
    token: opts.token,
    serverUrl: opts.serverUrl,
    pattern: opts.pattern ?? null,
  });
}

export async function stopEventStream(): Promise<void> {
  if (!isTauri()) return;
  await invoke("events_stop");
}

// Subscribe to parsed events from the Rust bridge. Returns an unlisten fn
// that the caller must invoke during cleanup. Separately wires up an
// `sse-error` listener so callers can react to disconnects (we re-emit
// these as a synthetic envelope with topic="$.connection.error").
export async function listenForEvents(
  onEvent: (ev: ParsedEvent) => void,
  onError?: (msg: string) => void,
  onClosed?: () => void
): Promise<UnlistenFn> {
  const unlisteners: UnlistenFn[] = [];

  unlisteners.push(
    await listen<string>("sse-event", ({ payload }) => {
      const parsed = parse(payload);
      if (parsed) onEvent(parsed);
    })
  );
  if (onError) {
    unlisteners.push(
      await listen<string>("sse-error", ({ payload }) => onError(payload))
    );
  }
  if (onClosed) {
    unlisteners.push(
      await listen("sse-closed", () => onClosed())
    );
  }

  return () => unlisteners.forEach((u) => u());
}
