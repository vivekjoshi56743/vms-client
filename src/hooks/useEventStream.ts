import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  listenForEvents,
  startEventStream,
  stopEventStream,
  type ParsedEvent,
} from "@/api/events";
import { useAuthStore } from "@/stores/auth";
import { useEventsStore } from "@/stores/events";

// Mount once at the app root (App.tsx). While the user is authenticated this
// keeps an SSE connection open via the Rust bridge and routes incoming
// envelopes into TanStack Query invalidations + toasts. Logout/token change
// closes the stream; a fresh login reopens it.
//
// Reconnection: on `sse-closed` we schedule a backoff-retry start. Errors are
// logged but don't toast — a flaky connection shouldn't spam the user.
export function useEventStream() {
  const token = useAuthStore((s) => s.token);
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const queryClient = useQueryClient();
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!token || !serverUrl) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    function clearReconnect() {
      if (reconnectTimer.current !== null) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    }

    function scheduleReconnect() {
      if (cancelled) return;
      const attempt = reconnectAttempt.current;
      // Exponential backoff capped at 30s: 1s, 2s, 4s, 8s, 16s, 30s, 30s, …
      const delay = Math.min(30_000, 1000 * 2 ** attempt);
      reconnectAttempt.current = attempt + 1;
      clearReconnect();
      reconnectTimer.current = setTimeout(() => {
        if (cancelled) return;
        void connect();
      }, delay);
    }

    async function connect() {
      if (cancelled) return;
      try {
        await startEventStream({ token: token!, serverUrl: serverUrl! });
        reconnectAttempt.current = 0; // success — reset backoff
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("event stream failed to start:", err);
        scheduleReconnect();
      }
    }

    (async () => {
      // `listen()` is async — by the time it resolves, the effect's cleanup
      // may already have run (React 18 StrictMode double-invokes effects;
      // any dep change also tears down). If we blindly assign the resolved
      // unlisten into our local `unlisten`, we leak the Tauri listener into
      // a dead scope that nothing will ever clean up. Over many reconnects
      // / HMR cycles / StrictMode mounts these accumulate, and every
      // backend event fans out to all of them — that's how 2 backend events
      // become 142 rows in the store.
      const u = await listenForEvents(
        (ev) => routeEvent(ev, queryClient),
        (msg) => {
          // eslint-disable-next-line no-console
          console.warn("sse-error:", msg);
        },
        () => {
          if (!cancelled) scheduleReconnect();
        }
      );
      if (cancelled) {
        u();
        return;
      }
      unlisten = u;
      await connect();
    })();

    return () => {
      cancelled = true;
      clearReconnect();
      if (unlisten) unlisten();
      void stopEventStream();
    };
  }, [token, serverUrl, queryClient]);
}

// Topic → cache invalidation + (rarely) toast + append to events log.
//
// Topic shapes (4 segments):
//   camera.<id>.health.changed     → refresh health caches; toast on offline
//   camera.<id>.stream.<state>     → refresh stream URL cache
//   recording.<id>.segment.<state> → refresh recordings list
function routeEvent(ev: ParsedEvent, queryClient: ReturnType<typeof useQueryClient>) {
  // Always log first so the Events page sees every event, even ones we
  // don't route to a cache or a toast.
  useEventsStore.getState().push({
    topic: ev.topic,
    domain: ev.domain,
    entityId: ev.id,
    kind: ev.kind,
    state: ev.state,
    data: ev.data,
  });

  if (ev.domain === "camera" && ev.kind === "health") {
    queryClient.invalidateQueries({ queryKey: ["cameras", "health"] });
    queryClient.invalidateQueries({ queryKey: ["cameras", ev.id, "health"] });
    // If the payload carries a status field and it's bad, toast the user.
    const status = (ev.data as { status?: string } | undefined)?.status;
    const name = (ev.data as { name?: string } | undefined)?.name;
    const who = name ?? ev.id;
    if (status === "offline") {
      toast.error(`Camera "${who}" went offline`);
    } else if (status === "degraded") {
      toast.warning(`Camera "${who}" is degraded`);
    }
    return;
  }

  if (ev.domain === "camera" && ev.kind === "stream") {
    queryClient.invalidateQueries({ queryKey: ["stream", ev.id] });
    return;
  }

  if (ev.domain === "recording" && ev.kind === "segment") {
    // Invalidate broadly — TanStack does prefix matching, so this catches
    // every ["recordings", cameraId, from, to] entry.
    queryClient.invalidateQueries({ queryKey: ["recordings"] });
    return;
  }

  // Unknown topic — log but don't error so we stay forward-compatible
  // with new event types added by the backend.
  // eslint-disable-next-line no-console
  console.debug("event:", ev.topic, ev.data);
}
