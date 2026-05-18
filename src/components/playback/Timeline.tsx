import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { formatLocalHM } from "@/lib/time";
import type { RecordingSegment } from "@/api/playback";

interface Props {
  /** Range start (RFC3339 UTC). */
  rangeStart: string;
  /** Range end (RFC3339 UTC). */
  rangeEnd: string;
  /** Recording segments covering this range. Must be sorted by started_at asc. */
  segments: RecordingSegment[];
  /** Highlight this segment as the one currently loaded. */
  activeSegmentId: string | null;
  /** Scrubber position in seconds since rangeStart — driven by <video>. */
  offsetSeconds: number;
  /** Called when the user releases a click/drag ON a green segment. Dead-zone
   *  clicks are swallowed (no callback). */
  onSeekCommit: (offsetSeconds: number) => void;
  className?: string;
}

const TICK_COUNT = 8;

// Timeline scrubber. Renders the range as a horizontal track, paints each
// recording segment as a filled bar, and lets the user click/drag to seek —
// but ONLY on the green segment bars themselves. Clicks on dead zones (no
// recording) are ignored.

export function Timeline({
  rangeStart,
  rangeEnd,
  segments,
  activeSegmentId,
  offsetSeconds,
  onSeekCommit,
  className,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hoverPct, setHoverPct] = useState<number | null>(null);
  // Latest offset under the cursor during a drag — committed on mouseup, but
  // only if it lands on a segment.
  const pendingSeekRef = useRef<number | null>(null);

  const rangeStartMs = Date.parse(rangeStart);
  const rangeEndMs = Date.parse(rangeEnd);
  const rangeMs = Math.max(0, rangeEndMs - rangeStartMs);
  const rangeSec = rangeMs / 1000;

  const playheadPct = rangeSec > 0
    ? Math.min(100, Math.max(0, (offsetSeconds / rangeSec) * 100))
    : 0;

  // Pre-compute bar geometry & cache start/end ms for hit-testing.
  const bars = useMemo(
    () =>
      segments
        .map((seg) => {
          const s = Date.parse(seg.started_at);
          const e = Date.parse(seg.ended_at);
          if (isNaN(s) || isNaN(e) || e <= s) return null;
          const left = Math.max(0, ((s - rangeStartMs) / rangeMs) * 100);
          const right = Math.min(100, ((e - rangeStartMs) / rangeMs) * 100);
          if (right <= 0 || left >= 100) return null;
          return {
            id: seg.id,
            startMs: s,
            endMs: e,
            left,
            width: right - left,
          };
        })
        .filter((b): b is NonNullable<typeof b> => b !== null),
    [segments, rangeStartMs, rangeMs]
  );

  function offsetFromClientX(clientX: number): number | null {
    const track = trackRef.current;
    if (!track || rangeSec === 0) return null;
    const rect = track.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return pct * rangeSec;
  }

  // True iff `offsetSec` (since rangeStart) lands inside any segment.
  function isOnSegment(offsetSec: number): boolean {
    const atMs = rangeStartMs + offsetSec * 1000;
    return bars.some((b) => atMs >= b.startMs && atMs < b.endMs);
  }

  function updateFromEvent(clientX: number) {
    const off = offsetFromClientX(clientX);
    if (off === null) return;
    pendingSeekRef.current = off;
    setHoverPct((off / rangeSec) * 100);
  }

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => updateFromEvent(e.clientX);
    const onUp = () => {
      setDragging(false);
      const off = pendingSeekRef.current;
      pendingSeekRef.current = null;
      setHoverPct(null);
      if (off !== null && isOnSegment(off)) onSeekCommit(off);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, rangeStart, rangeEnd, bars]);

  // Tick marks across the range
  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, i) => {
    const pct = (i / TICK_COUNT) * 100;
    const t = new Date(rangeStartMs + (rangeMs * i) / TICK_COUNT).toISOString();
    return { pct, label: formatLocalHM(t) };
  });

  // Cursor: pointer over segments, default elsewhere.
  const cursorOverSegment =
    hoverPct !== null && isOnSegment((hoverPct / 100) * rangeSec);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {/* Tick labels */}
      <div className="relative h-3 select-none">
        {ticks.map((t, i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2 font-mono text-[10px] text-text-tertiary"
            style={{ left: `${t.pct}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        onMouseDown={(e) => {
          // Start a potential drag, but only commit on a release that lands
          // on a segment. If the mousedown is already on a segment, fire the
          // commit immediately too so a simple click works.
          setDragging(true);
          updateFromEvent(e.clientX);
          const off = offsetFromClientX(e.clientX);
          if (off !== null && isOnSegment(off)) onSeekCommit(off);
        }}
        onMouseMove={(e) => {
          if (!dragging) {
            const off = offsetFromClientX(e.clientX);
            setHoverPct(off === null ? null : (off / rangeSec) * 100);
          }
        }}
        onMouseLeave={() => {
          if (!dragging) setHoverPct(null);
        }}
        className={cn(
          "relative h-8 overflow-hidden rounded border border-border bg-canvas-deep",
          "select-none",
          cursorOverSegment ? "cursor-pointer" : "cursor-default"
        )}
      >
        {/* Tick guides */}
        {ticks.map((t, i) => (
          <span
            key={i}
            className="absolute top-0 h-full w-px bg-border-subtle"
            style={{ left: `${t.pct}%` }}
          />
        ))}

        {/* Recording segments */}
        {bars.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center font-mono text-[10.5px] uppercase tracking-[0.08em] text-text-disabled">
            No recordings in this range
          </div>
        )}
        {bars.map((b) => {
          const isActive = b.id === activeSegmentId;
          return (
            <div
              key={b.id}
              className={cn(
                "absolute inset-y-1 rounded-[1px] bg-status-online",
                isActive
                  ? "opacity-100 ring-1 ring-accent-bright"
                  : "opacity-70 hover:opacity-90"
              )}
              style={{ left: `${b.left}%`, width: `${b.width}%` }}
              title={`${b.id.slice(0, 8)}… (${Math.round((b.endMs - b.startMs) / 1000)}s)`}
            />
          );
        })}

        {/* Playhead */}
        <div
          className="pointer-events-none absolute top-0 h-full w-px bg-accent-bright"
          style={{
            left: `${playheadPct}%`,
            boxShadow: "0 0 6px var(--accent-glow)",
          }}
        >
          <span
            className="absolute -left-[5px] top-0 h-2.5 w-2.5 rotate-45 bg-accent-bright"
            style={{ boxShadow: "0 0 6px var(--accent-glow)" }}
          />
        </div>
      </div>
    </div>
  );
}
