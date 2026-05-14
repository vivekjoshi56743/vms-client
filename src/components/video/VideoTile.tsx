import { useState } from "react";

import { cn } from "@/lib/cn";
import { VideoPlayer, type PlayerState } from "@/components/video/VideoPlayer";
import { LiveBadge } from "@/components/video/LiveBadge";
import { CameraHealthBadge } from "@/components/camera/CameraHealthBadge";
import type { Camera } from "@/api/cameras";
import type { CameraHealth } from "@/api/health";

interface Props {
  camera: Camera;
  /** WHEP or HLS URL for this tile. */
  url: string | null;
  health?: CameraHealth;
  className?: string;
  style?: React.CSSProperties;
}

// A single video tile: the player fills the container, with a chrome overlay
// showing name (top-left), LIVE badge (top-right), and health status
// (bottom-left). Chrome uses --video-chrome-* tokens so it's legible on any
// video content.
export function VideoTile({ camera, url, health, className, style }: Props) {
  const [playerState, setPlayerState] = useState<PlayerState>("idle");

  return (
    <div className={cn("relative overflow-hidden rounded-card bg-black", className)} style={style}>
      <VideoPlayer
        url={url}
        className="h-full w-full"
        onStateChange={setPlayerState}
        muted
      />

      {/* Chrome overlay — only shown while playing */}
      {playerState === "playing" && (
        <>
          {/* Top bar */}
          <div
            className="absolute inset-x-0 top-0 flex items-start justify-between px-3 pb-4 pt-2.5"
            style={{
              background:
                "linear-gradient(to bottom, var(--video-chrome-bg), transparent)",
            }}
          >
            <span
              className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: "var(--video-chrome-text)" }}
            >
              {camera.name}
            </span>
            <LiveBadge />
          </div>

          {/* Bottom bar */}
          <div
            className="absolute inset-x-0 bottom-0 flex items-end px-3 pb-2.5 pt-4"
            style={{
              background:
                "linear-gradient(to top, var(--video-chrome-bg), transparent)",
            }}
          >
            <CameraHealthBadge status={health?.status ?? "unknown"} />
          </div>
        </>
      )}
    </div>
  );
}
