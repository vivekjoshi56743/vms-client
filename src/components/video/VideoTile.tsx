import { useState, useEffect } from "react";
import { Maximize2 } from "lucide-react";

import { cn } from "@/lib/cn";
import { VideoPlayer, type PlayerState } from "@/components/video/VideoPlayer";
import type { Camera } from "@/api/cameras";
import type { CameraHealth } from "@/api/health";

interface Props {
  camera: Camera;
  /** Primary URL: WHEP preferred, HLS if no WHEP available. */
  url: string | null;
  /** HLS URL to silently fall back to when WHEP fails (H.265 cameras). */
  hlsFallback?: string | null;
  health?: CameraHealth;
  className?: string;
  style?: React.CSSProperties;
}

// Derive a short location tag from camera name.
// "FRONT_ENTRANCE" → "MAIN" (fallback), "N_BR_ENTRANCE" → "N.BR", etc.
function locationTag(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes("N_BR") || upper.includes("NBR")) return "N.BR";
  if (upper.includes("WHSE") || upper.includes("WAREHOUSE")) return "WHSE";
  if (upper.includes("MAIN") || upper.includes("FRONT") || upper.includes("ENTRANCE")) return "MAIN";
  if (upper.includes("PARK")) return "PARK";
  if (upper.includes("DOCK")) return "DOCK";
  // Generic: take first segment of underscore-separated name
  const seg = upper.split("_")[0];
  return seg && seg.length <= 5 ? seg : "CAM";
}

function useClock() {
  const [time, setTime] = useState(() => formatTime(new Date()));
  useEffect(() => {
    const id = setInterval(() => setTime(formatTime(new Date())), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function VideoTile({ camera, url, hlsFallback, health, className, style }: Props) {
  const [playerState, setPlayerState] = useState<PlayerState>("idle");
  const isPlaying = playerState === "playing";
  const isCritical = health?.status === "offline" || health?.status === "degraded";
  const tag = locationTag(camera.name);
  const clock = useClock();

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded bg-black",
        isCritical && "ring-1 ring-status-critical",
        className
      )}
      style={style}
    >
      <VideoPlayer
        url={url}
        hlsFallback={hlsFallback}
        className="h-full w-full"
        onStateChange={setPlayerState}
        muted
      />

      {/* Chrome — shown while playing */}
      {isPlaying && (
        <>
          {/* Top gradient */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-14"
            style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)" }}
          />
          {/* Bottom gradient */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)" }}
          />

          {/* Top-left: camera tag (status dot + name + location badge) */}
          <div className="absolute left-2.5 top-2 flex items-center gap-1.5 rounded-[3px] border border-video-chrome-border bg-video-chrome-bg px-2 py-[3px] backdrop-blur-sm">
            <span
              className="h-[6px] w-[6px] flex-shrink-0 rounded-full"
              style={{
                background: health?.status === "online"
                  ? "var(--video-online-dot)"
                  : "var(--video-offline-dot)",
                boxShadow: health?.status === "online"
                  ? "0 0 5px var(--status-online-glow)"
                  : "0 0 5px var(--status-critical-glow)",
              }}
            />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.02em] text-video-chrome-text">
              {camera.name}
            </span>
            <span className="rounded-[2px] bg-accent-subtle px-1.5 font-mono text-[9px] font-semibold uppercase text-accent-text">
              {tag}
            </span>
          </div>

          {/* Top-right: timestamp */}
          <div className="absolute right-2.5 top-2 rounded-[3px] border border-video-chrome-border bg-video-chrome-bg px-2 py-[3px] backdrop-blur-sm">
            <span className="font-mono text-[10.5px] font-medium text-video-chrome-text-muted tabular-nums">
              {clock}
            </span>
          </div>

          {/* Bottom-left: REC badge */}
          <div className="absolute bottom-2 left-2.5 flex items-center gap-1.5 rounded-[2px] border border-video-chrome-border bg-video-chrome-bg px-1.5 py-[3px] backdrop-blur-sm">
            <span
              className="h-[5px] w-[5px] flex-shrink-0 rounded-full bg-status-critical"
              style={{ animation: "critical-pulse 1.2s ease-in-out infinite" }}
            />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-video-chrome-text-muted">
              REC
            </span>
          </div>

          {/* Bottom-right: expand stub */}
          <button
            className="absolute bottom-2 right-2.5 rounded-[3px] border border-video-chrome-border bg-video-chrome-bg p-[3px] backdrop-blur-sm text-video-chrome-text-muted opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Expand"
            onClick={(e) => e.stopPropagation()}
          >
            <Maximize2 className="h-3 w-3" />
          </button>
        </>
      )}

      {/* Corner brackets — always shown when playing, red when critical */}
      {isPlaying && (
        <>
          <CornerBracket pos="tl" critical={isCritical} />
          <CornerBracket pos="tr" critical={isCritical} />
          <CornerBracket pos="bl" critical={isCritical} />
          <CornerBracket pos="br" critical={isCritical} />
        </>
      )}

      {/* Offline overlay — shown when health is offline and not playing */}
      {!isPlaying && health?.status === "offline" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-canvas-deep">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
            {camera.name} · OFFLINE
          </span>
        </div>
      )}
    </div>
  );
}

function CornerBracket({ pos, critical }: { pos: "tl" | "tr" | "bl" | "br"; critical: boolean }) {
  const color = critical ? "var(--status-critical)" : "rgba(244,244,245,0.45)";
  const size = critical ? 14 : 12;

  const style: React.CSSProperties = {
    position: "absolute",
    width: size,
    height: size,
    borderColor: color,
    borderStyle: "solid",
    borderWidth: 0,
    pointerEvents: "none",
  };

  if (pos === "tl") { style.top = 6; style.left = 6; style.borderTopWidth = 1; style.borderLeftWidth = 1; }
  if (pos === "tr") { style.top = 6; style.right = 6; style.borderTopWidth = 1; style.borderRightWidth = 1; }
  if (pos === "bl") { style.bottom = 6; style.left = 6; style.borderBottomWidth = 1; style.borderLeftWidth = 1; }
  if (pos === "br") { style.bottom = 6; style.right = 6; style.borderBottomWidth = 1; style.borderRightWidth = 1; }

  return <span style={style} />;
}
