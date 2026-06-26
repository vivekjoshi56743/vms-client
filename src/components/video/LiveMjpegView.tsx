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
// one frame at a time through the Rust pinned-TLS proxy and paint a <canvas>.
// No MSE, no WebRTC, no codecs in the WebView — only JPEG decode, which every
// WebKitGTK build supports. macOS/Windows never mount this (they keep VideoPlayer).
// See docs/video-streaming-architecture.md.
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

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let painted = false;

    onStateChangeRef.current?.("connecting");
    const ctx = canvasRef.current?.getContext("2d") ?? null;

    const tick = async () => {
      if (stopped) return;
      const url = frameUrlRef.current;
      if (url) {
        try {
          const r = await fetchMjpegFrame(url);
          if (r.ok) {
            const bmp = await createImageBitmap(r.blob);
            const canvas = canvasRef.current;
            if (ctx && canvas) {
              if (canvas.width !== bmp.width) canvas.width = bmp.width;
              if (canvas.height !== bmp.height) canvas.height = bmp.height;
              ctx.drawImage(bmp, 0, 0);
              if (!painted) {
                painted = true;
                onStateChangeRef.current?.("playing");
              }
            }
            bmp.close();
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
    };
  }, [cameraId, refetch]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("h-full w-full bg-black object-contain", className)}
    />
  );
}
