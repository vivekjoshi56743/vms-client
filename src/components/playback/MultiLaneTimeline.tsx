import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { useRecordings } from "@/hooks/usePlayback";
import { formatLocalHM } from "@/lib/time";
import type { RecordingSegment } from "@/api/playback";

interface CameraRef {
  id: string;
  name: string;
}

interface Props {
  cameras: CameraRef[];
  primaryCameraId: string | null;
  onSelectPrimary: (id: string) => void;
  rangeStart: string;
  rangeEnd: string;
  globalTimeMs: number;
  onSeek: (timeMs: number) => void;
}

// One row per selected camera, all sharing the same time axis. The vertical
// scrubber line spans every lane; dragging it (or clicking) seeks every
// camera to the new global time. Clicking a lane (not on a segment block)
// also makes that camera the primary.

const TICK_COUNT = 8;
const LANE_HEIGHT = 36; // px

export function MultiLaneTimeline({
  cameras,
  primaryCameraId,
  onSelectPrimary,
  rangeStart,
  rangeEnd,
  globalTimeMs,
  onSeek,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const rangeStartMs = Date.parse(rangeStart);
  const rangeEndMs = Date.parse(rangeEnd);
  const rangeMs = Math.max(0, rangeEndMs - rangeStartMs);

  const playheadPct = rangeMs > 0
    ? Math.min(100, Math.max(0, ((globalTimeMs - rangeStartMs) / rangeMs) * 100))
    : 0;

  const ticks = useMemo(
    () =>
      Array.from({ length: TICK_COUNT + 1 }, (_, i) => {
        const pct = (i / TICK_COUNT) * 100;
        const t = new Date(rangeStartMs + (rangeMs * i) / TICK_COUNT).toISOString();
        return { pct, label: formatLocalHM(t) };
      }),
    [rangeStartMs, rangeMs]
  );

  function timeMsFromClientX(clientX: number): number | null {
    const el = trackRef.current;
    if (!el || rangeMs === 0) return null;
    const rect = el.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return rangeStartMs + pct * rangeMs;
  }

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const t = timeMsFromClientX(e.clientX);
      if (t !== null) onSeek(t);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, rangeStartMs, rangeMs]);

  return (
    <div className="flex-shrink-0 border-t border-border-subtle bg-canvas-raised px-5 py-3">
      {/* Tick labels */}
      <div className="relative ml-[140px] h-3 select-none">
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

      {/* Lane stack */}
      <div className="mt-1 flex flex-col gap-1">
        {cameras.map((cam) => (
          <Lane
            key={cam.id}
            cameraId={cam.id}
            cameraName={cam.name}
            isPrimary={cam.id === primaryCameraId}
            onSelectPrimary={() => onSelectPrimary(cam.id)}
            rangeStartMs={rangeStartMs}
            rangeMs={rangeMs}
          />
        ))}
      </div>

      {/* Scrubber track — overlays the lanes for click/drag */}
      <div
        ref={trackRef}
        onMouseDown={(e) => {
          setDragging(true);
          const t = timeMsFromClientX(e.clientX);
          if (t !== null) onSeek(t);
        }}
        className="pointer-events-auto relative -mt-[var(--stack-h)] ml-[140px] cursor-ew-resize select-none"
        style={{
          height: cameras.length * (LANE_HEIGHT + 4) + "px",
          // Negative top margin via CSS var — lift the overlay over the lane stack
          marginTop: `-${cameras.length * (LANE_HEIGHT + 4)}px`,
        }}
      >
        {/* Playhead line spanning all lanes */}
        <div
          className="pointer-events-none absolute top-0 h-full w-px bg-accent-bright"
          style={{
            left: `${playheadPct}%`,
            boxShadow: "0 0 6px var(--accent-glow)",
          }}
        >
          <span
            className="absolute -left-[5px] -top-1 h-2.5 w-2.5 rotate-45 bg-accent-bright"
            style={{ boxShadow: "0 0 6px var(--accent-glow)" }}
          />
        </div>
      </div>
    </div>
  );
}

function Lane({
  cameraId,
  cameraName,
  isPrimary,
  onSelectPrimary,
  rangeStartMs,
  rangeMs,
}: {
  cameraId: string;
  cameraName: string;
  isPrimary: boolean;
  onSelectPrimary: () => void;
  rangeStartMs: number;
  rangeMs: number;
}) {
  // ISO strings for the range so we can pass them to useRecordings.
  const rangeStart = new Date(rangeStartMs).toISOString();
  const rangeEnd = new Date(rangeStartMs + rangeMs).toISOString();
  const recordings = useRecordings(cameraId, { from: rangeStart, to: rangeEnd });

  const bars = useMemo(() => {
    const segments: RecordingSegment[] = recordings.data?.segments ?? [];
    return segments
      .map((seg) => {
        const s = Date.parse(seg.started_at);
        const e = Date.parse(seg.ended_at);
        if (!isFinite(s) || !isFinite(e) || e <= s) return null;
        const left = Math.max(0, ((s - rangeStartMs) / rangeMs) * 100);
        const right = Math.min(100, ((e - rangeStartMs) / rangeMs) * 100);
        if (right <= 0 || left >= 100) return null;
        return { id: seg.id, left, width: right - left };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);
  }, [recordings.data, rangeStartMs, rangeMs]);

  return (
    <div className="flex items-stretch gap-2" style={{ height: LANE_HEIGHT }}>
      {/* Label gutter */}
      <button
        onClick={onSelectPrimary}
        className={cn(
          "flex w-[132px] flex-shrink-0 items-center gap-2 truncate rounded px-2 text-left transition-colors",
          isPrimary ? "bg-accent-subtle text-accent-text" : "text-text-secondary hover:bg-surface"
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 flex-shrink-0 rounded-full",
            isPrimary ? "bg-accent" : "bg-status-offline"
          )}
        />
        <span className="truncate font-mono text-[10.5px] uppercase tracking-[0.06em]">
          {cameraName}
        </span>
      </button>

      {/* Lane body */}
      <div
        className={cn(
          "relative flex-1 overflow-hidden rounded-[2px] border border-border",
          isPrimary ? "bg-accent-subtle/20" : "bg-canvas-deep"
        )}
      >
        {recordings.isLoading && (
          <div className="absolute inset-0 flex items-center justify-center font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-disabled">
            Loading…
          </div>
        )}
        {!recordings.isLoading && bars.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center font-mono text-[9.5px] uppercase tracking-[0.08em] text-text-disabled">
            No recordings
          </div>
        )}
        {bars.map((b) => (
          <div
            key={b.id}
            className="absolute inset-y-1 rounded-[1px] bg-status-online opacity-70"
            style={{ left: `${b.left}%`, width: `${b.width}%` }}
          />
        ))}
      </div>
    </div>
  );
}
