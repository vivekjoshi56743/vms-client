import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import type { PlayerState } from "@/components/video/VideoPlayer";

// Aggregate progress overlay used wherever a grid of VideoTiles is mounting
// at once (LivePage's main grid, Dashboard's pinned cameras strip, future
// surveillance windows). Fades out when every "expected to play" tile has
// reached `playing`, or after a hard fallback timeout so a single broken
// camera doesn't pin the splash up forever.
//
// "Expected to play" excludes cameras whose health is offline/degraded —
// those will surface their own per-tile overlay; counting them would
// prevent the splash from ever clearing on a partially-down system.

// Minimum time the splash stays up, even if every stream connects faster
// than that. On a healthy LAN tiles can reach `playing` in <200 ms, which
// makes the splash flash and disappear — worse than not showing it at all.
const SPLASH_MIN_MS = 2_000;
// Hard ceiling — a single broken camera can't pin the splash up indefinitely.
const SPLASH_FALLBACK_MS = 8_000;

interface Props {
  /** Camera IDs whose tiles are expected to come up in this container. */
  slotCameraIds: string[];
  /** Per-camera player state as reported by VideoTile.onStateChange. */
  tileStates: Record<string, PlayerState>;
  /** Health map keyed by camera id — offline-marked cameras are excluded
   *  from the "expected" denominator. */
  healthMap: Record<string, { status: string } | undefined>;
  /** Optional top label override. Default: "Establishing live feeds". */
  eyebrow?: string;
  /** Optional bottom label override. Default: "Connecting streams". */
  caption?: string;
  /** Optional fallback timeout override (ms). Discovery preview bumps this
   *  to 10 s so the splash doesn't drop before WHEP exhausts its
   *  not-ready retries (~9.6 s budget). */
  fallbackMs?: number;
}

export function ConnectingSplash({
  slotCameraIds,
  tileStates,
  healthMap,
  eyebrow = "Establishing live feeds",
  caption = "Connecting streams",
  fallbackMs = SPLASH_FALLBACK_MS,
}: Props) {
  // Reset both timers whenever the camera set changes (layout switch, slot
  // assignment, pin edit, etc.) so the splash re-runs its full lifecycle
  // for the new tiles.
  const [minElapsed, setMinElapsed] = useState(false);
  const [fallbackElapsed, setFallbackElapsed] = useState(false);
  useEffect(() => {
    setMinElapsed(false);
    setFallbackElapsed(false);
    const minId = setTimeout(() => setMinElapsed(true), SPLASH_MIN_MS);
    const maxId = setTimeout(() => setFallbackElapsed(true), fallbackMs);
    return () => {
      clearTimeout(minId);
      clearTimeout(maxId);
    };
  }, [slotCameraIds.join("|"), fallbackMs]);

  const expected = slotCameraIds.filter(
    (id) => healthMap[id]?.status !== "offline"
  );
  const playing = expected.filter((id) => tileStates[id] === "playing").length;
  const total = expected.length;

  // Hide rules:
  //   • No expected tiles at all (nothing's coming) → hide immediately.
  //   • Every expected tile is playing AND the 2 s minimum has elapsed.
  //   • Fallback ceiling hit (8 s) → hide regardless.
  const allPlaying = playing >= total;
  const hidden =
    total === 0 || (allPlaying && minElapsed) || fallbackElapsed;

  return (
    <div
      aria-hidden={hidden}
      className={cn(
        "pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden rounded-card",
        "transition-opacity duration-500",
        hidden ? "opacity-0" : "opacity-100"
      )}
      style={{
        // Opaque dark surface with the mockup's dot-grid + ambient cyan glow.
        // Layers, painted back-to-front:
        //   1. Solid canvas-deep — fully opaque so video tiles never show through.
        //   2. Radial cyan wash centered on the splash.
        //   3. 32 px dot-grid pattern in --grid tone.
        backgroundColor: "var(--canvas-deep)",
        backgroundImage:
          "radial-gradient(ellipse at 50% 45%, rgba(34,211,238,0.10) 0%, transparent 55%)," +
          "radial-gradient(circle at 1px 1px, var(--grid) 1px, transparent 0)",
        backgroundSize: "auto, 32px 32px",
      }}
    >
      {/* Ambient pulsing glow ring */}
      <span
        className="pointer-events-none absolute h-[440px] w-[440px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(34,211,238,0.10) 0%, transparent 60%)",
          animation: "splash-glow 4s ease-in-out infinite alternate",
        }}
      />

      <div className="relative z-10 flex max-w-sm flex-col items-center gap-5 px-6 text-center">
        {/* Eyebrow with horizontal dashes — matches mockup .splash-tip */}
        <div className="flex items-center gap-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent">
          <span className="block h-px w-7 bg-accent/40" />
          {eyebrow}
          <span className="block h-px w-7 bg-accent/40" />
        </div>

        {/* Big M / N counter */}
        <div className="font-mono text-[44px] font-semibold leading-none tabular-nums">
          <span className="text-accent" style={{ textShadow: "0 0 18px var(--accent-glow)" }}>
            {playing}
          </span>
          <span className="mx-3 text-text-disabled">/</span>
          <span className="text-text-primary">{total}</span>
        </div>

        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-tertiary">
          {caption}
        </span>

        {/* Progress bar with cyan glow */}
        <div className="h-[2px] w-[280px] overflow-hidden rounded-full bg-surface">
          <div
            className="h-full transition-[width] duration-300"
            style={{
              width: total > 0 ? `${(playing / total) * 100}%` : "0%",
              background: "linear-gradient(90deg, var(--accent), var(--accent-bright))",
              boxShadow: "0 0 12px var(--accent-glow)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
