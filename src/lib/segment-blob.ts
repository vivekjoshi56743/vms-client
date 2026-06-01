import { useCallback, useEffect, useRef, useState } from "react";

import { fetchPlaybackDataUrl } from "@/api/playback";

// Imperative single-segment blob loader.
// Given a segment id, fetches its playback URL (Bearer-authed) → makes a
// blob URL we can hand to <video src>. One segment at a time; loading a
// new id revokes the previous URL.

export type SegmentBlobState = "idle" | "loading" | "ready" | "error";

export interface SegmentBlobHandle {
  url: string | null;
  state: SegmentBlobState;
  error: string | null;
  load: (segmentId: string) => Promise<void>;
  reset: () => void;
}

export function useSegmentBlob(): SegmentBlobHandle {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<SegmentBlobState>("idle");
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);

  const load = useCallback(async (segmentId: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setState("loading");
    setError(null);

    try {
      if (ac.signal.aborted) return;
      const dataUrl = await fetchPlaybackDataUrl(segmentId, ac.signal);
      if (ac.signal.aborted) return;
      if (urlRef.current && urlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(urlRef.current);
      }
      urlRef.current = dataUrl;
      setUrl(dataUrl);
      setState("ready");
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return;
      setError((e as Error).message);
      setState("error");
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (urlRef.current && urlRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(urlRef.current);
    }
    urlRef.current = null;
    setUrl(null);
    setState("idle");
    setError(null);
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (urlRef.current && urlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(urlRef.current);
      }
    },
    []
  );

  return { url, state, error, load, reset };
}
