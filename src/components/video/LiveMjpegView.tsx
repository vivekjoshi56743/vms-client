import { useEffect, useRef } from "react";

import { cn } from "@/lib/cn";
import { useMjpegToken } from "@/hooks/useMjpegToken";
import { fetchMjpegFrame } from "@/api/mjpeg";
import type { PlayerState } from "@/components/video/VideoPlayer";

// Poll a little above the 5 fps the backend produces, so we never miss a frame
// but don't hammer the Rust IPC re-fetching identical ones.
const POLL_INTERVAL_MS = 150;

interface Props {
  cameraId: string;
  onStateChange?: (state: PlayerState) => void;
  className?: string;
}

// Linux live path. The backend (Go + ffmpeg) decodes the camera to JPEG; we pull
// one frame at a time through the Rust pinned-TLS proxy and display it.
//
// We render into an <img> (object-URL swapped per frame), NOT a <canvas>: the
// accelerated 2D-canvas path fails to composite on the proprietary NVIDIA driver
// (RTX 3090 box → grey tile), while plain <img> image rendering doesn't use that
// path and works on every WebKitGTK/GPU combo. Image decode (JPEG) is the one
// primitive present in every WebView. macOS/Windows never mount this (they keep
// VideoPlayer). See docs/video-streaming-architecture.md §6.1.
export function LiveMjpegView({ cameraId, onStateChange, className }: Props) {
  const { data, refetch } = useMjpegToken(cameraId);

  // The current frame URL (carries the token); updated as the token re-mints.
  // Held in a ref so the poll loop always reads the latest without restarting.
  const frameUrlRef = useRef<string | null>(null);
  frameUrlRef.current = data?.frameUrl ?? null;

  // onStateChange is a fresh closure each render; keep it in a ref so it isn't
  // an effect dependency (which would restart the poll loop every render).
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let painted = false;
    let objUrl: string | null = null; // current <img> src; revoked when replaced

    onStateChangeRef.current?.("connecting");

    const tick = async () => {
      if (stopped) return;
      const url = frameUrlRef.current;
      if (url) {
        try {
          const r = await fetchMjpegFrame(url);
          if (r.ok) {
            const img = imgRef.current;
            if (img) {
              const next = URL.createObjectURL(r.blob);
              const prev = objUrl;
              objUrl = next;
              img.src = next;
              // The old URL already loaded; free it now that the new one is set.
              if (prev) URL.revokeObjectURL(prev);
              if (!painted) {
                painted = true;
                onStateChangeRef.current?.("playing");
              }
            }
          } else if (r.status === 401) {
            refetch(); // token expired → re-mint
          }
          // 503 (transcode warming) and other transient errors: just retry.
        } catch {
          // decode/network hiccup — retry next tick
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

  return (
    <img
      ref={imgRef}
      alt=""
      className={cn("h-full w-full bg-black object-contain", className)}
    />
  );
}
