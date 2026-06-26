import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

import { cn } from "@/lib/cn";
import { useStream } from "@/hooks/useStream";
import type { PlayerState } from "@/components/video/VideoPlayer";

interface Props {
  cameraId: string;
  /** Per-tile framerate cap (full rate for a focused/1×1 tile, lower in a grid). */
  fps?: number;
  onStateChange?: (state: PlayerState) => void;
  className?: string;
}

// Linux tolerant-live PoC. Frames are decoded by Rust (src-tauri/src/live_mjpeg.rs)
// and pulled here via the `liveframe://` scheme into a <canvas>, bypassing
// WebKitGTK's MSE video sink entirely — that sink drops frames on our cameras'
// irregular ~19.25 fps timestamps (stutter), which a canvas/<img> path doesn't.
// See docs/video-streaming-architecture.md (Linux live).
//
// Uses the camera's NATIVE rtsp (no transcode): GStreamer decodes HEVC fine, so
// there's no codec verify/fallback here — that whole dance only exists because
// the WebView's decoders are unreliable, and we're not using them.
export function LiveMjpegView({ cameraId, fps = 15, onStateChange, className }: Props) {
  const { data: stream } = useStream(cameraId);
  const rtsp = stream?.rtsp ?? null;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!rtsp) return;
    let stopped = false;
    let raf = 0;
    let painted = false;

    onStateChange?.("connecting");
    invoke("live_start", { cameraId, rtspUrl: rtsp, fps }).catch(() => {
      if (!stopped) onStateChange?.("error");
    });

    const ctx = canvasRef.current?.getContext("2d") ?? null;
    const tick = async () => {
      if (stopped) return;
      try {
        const res = await fetch(`liveframe://localhost/${cameraId}?t=${performance.now()}`);
        if (res.ok) {
          const bmp = await createImageBitmap(await res.blob());
          const canvas = canvasRef.current;
          if (ctx && canvas) {
            if (canvas.width !== bmp.width) canvas.width = bmp.width;
            if (canvas.height !== bmp.height) canvas.height = bmp.height;
            ctx.drawImage(bmp, 0, 0);
            if (!painted) {
              painted = true;
              onStateChange?.("playing");
            }
          }
          bmp.close();
        }
      } catch {
        // frame not decoded yet / transient — retry on the next animation frame
      }
      if (!stopped) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      invoke("live_stop", { cameraId }).catch(() => {});
    };
  }, [rtsp, cameraId, fps, onStateChange]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("h-full w-full bg-black object-contain", className)}
    />
  );
}
