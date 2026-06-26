import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { useMjpegToken } from "@/hooks/useMjpegToken";
import { fetchMjpegFrame } from "@/api/mjpeg";
import type { PlayerState } from "@/components/video/VideoPlayer";

const POLL_INTERVAL_MS = 150;

// TEMPORARY: on-screen diagnostic overlay so we can see, on the grey-tile box,
// exactly which step fails (no DevTools needed). Remove once the Linux render
// issue is pinned down.
const DEBUG_OVERLAY = true;

interface Props {
  cameraId: string;
  onStateChange?: (state: PlayerState) => void;
  className?: string;
}

interface Diag {
  status: string;   // last HTTP status of the frame fetch (or error text)
  bytes: number;    // size of the last frame blob
  type: string;     // MIME type of the last frame blob (should be image/jpeg)
  fetched: number;  // successful frame fetches
  loaded: number;   // <img> onload fires (decoded + ready to paint)
  imgErr: number;   // <img> onerror fires (couldn't decode the blob)
  err: string;      // last fetch/exception message
}

// Linux live path. Backend (Go + ffmpeg) decodes the camera to JPEG; we pull one
// frame at a time through the Rust pinned-TLS proxy and show it in an <img>.
// See docs/video-streaming-architecture.md §6.1.
export function LiveMjpegView({ cameraId, onStateChange, className }: Props) {
  const { data, refetch, error: tokErr, isLoading: tokLoading } = useMjpegToken(cameraId);

  const frameUrlRef = useRef<string | null>(null);
  frameUrlRef.current = data?.frameUrl ?? null;

  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  const imgRef = useRef<HTMLImageElement>(null);
  const [diag, setDiag] = useState<Diag>({
    status: "…", bytes: 0, type: "", fetched: 0, loaded: 0, imgErr: 0, err: "",
  });

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let painted = false;
    let objUrl: string | null = null;

    onStateChangeRef.current?.("connecting");

    const tick = async () => {
      if (stopped) return;
      const url = frameUrlRef.current;
      if (url) {
        try {
          const r = await fetchMjpegFrame(url);
          if (r.ok) {
            const blob = r.blob;
            const img = imgRef.current;
            if (img) {
              const next = URL.createObjectURL(blob);
              const prev = objUrl;
              objUrl = next;
              img.src = next;
              if (prev) URL.revokeObjectURL(prev);
              if (!painted) {
                painted = true;
                onStateChangeRef.current?.("playing");
              }
            }
            if (DEBUG_OVERLAY) {
              setDiag((d) => ({
                ...d, status: "200", bytes: blob.size,
                type: blob.type || "(none)", fetched: d.fetched + 1, err: "",
              }));
            }
          } else {
            if (DEBUG_OVERLAY) setDiag((d) => ({ ...d, status: String(r.status) }));
            if (r.status === 401) refetch();
          }
        } catch (e) {
          if (DEBUG_OVERLAY) {
            const msg = e instanceof Error ? e.message : String(e);
            setDiag((d) => ({ ...d, err: msg }));
          }
        }
      }
      if (!stopped) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    timer = setTimeout(tick, 0);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [cameraId, refetch]);

  const tokenStatus = tokLoading ? "minting" : tokErr ? "ERR" : data?.frameUrl ? "ok" : "none";
  let host = "?";
  try { host = data?.frameUrl ? new URL(data.frameUrl).host : "?"; } catch { /* ignore */ }

  return (
    <div className={cn("relative h-full w-full bg-black", className)}>
      <img
        ref={imgRef}
        alt=""
        className="h-full w-full object-contain"
        onLoad={() => DEBUG_OVERLAY && setDiag((d) => ({ ...d, loaded: d.loaded + 1 }))}
        onError={() => DEBUG_OVERLAY && setDiag((d) => ({ ...d, imgErr: d.imgErr + 1 }))}
      />
      {DEBUG_OVERLAY && (
        <div className="absolute left-1 top-1 z-10 max-w-full bg-black/75 px-1.5 py-1 font-mono text-[10px] leading-tight text-green-400">
          <div>host:{host}</div>
          <div>tok:{tokenStatus} get:{diag.status}</div>
          <div>fetch:{diag.fetched} load:{diag.loaded} imgErr:{diag.imgErr}</div>
          <div>bytes:{diag.bytes} type:{diag.type || "-"}</div>
          {diag.err && <div className="text-red-400">err:{diag.err.slice(0, 60)}</div>}
        </div>
      )}
    </div>
  );
}
