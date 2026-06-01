import { useEffect, useMemo } from "react";
import { Film, Plus, Minus, Play, Pause, SkipBack, SkipForward, Download, AlertCircle } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CameraSelectorPanel } from "@/components/playback/CameraSelectorPanel";
import { PlaybackTileGrid } from "@/components/playback/PlaybackTileGrid";
import { MultiLaneTimeline } from "@/components/playback/MultiLaneTimeline";
import { useCameras } from "@/hooks/useCameras";
import { usePlaybackStore, SPEEDS } from "@/stores/playback";

// Two-pane playback workspace:
//   Left:  CameraSelectorPanel — calendar + time-range + grouped camera multi-select
//   Right: tile grid (1..16) + transport + multi-lane timeline
//
// Each tile is its own playback unit, but they all share the store's
// globalTimeMs. The "primary" tile pushes time forward via its video
// timeupdate; the rest follow.

export function PlaybackPage() {
  const cameras = useCameras();
  const {
    cameraIds, primaryCameraId, setPrimary, setCameras,
    rangeStart, rangeEnd,
    globalTimeMs, isPlaying, speed, togglePlaying, setPlaying,
    setSpeed, seekTo,
  } = usePlaybackStore();

  // Reflect newly-removed cameras (e.g. deleted) out of the selection.
  useEffect(() => {
    if (!cameras.data) return;
    const validIds = new Set(cameras.data.map((c) => c.id));
    const filtered = cameraIds.filter((id) => validIds.has(id));
    if (filtered.length !== cameraIds.length) setCameras(filtered);
  }, [cameras.data, cameraIds, setCameras]);

  const selectedCameras = useMemo(
    () =>
      cameraIds
        .map((id) => cameras.data?.find((c) => c.id === id))
        .filter((c): c is NonNullable<typeof c> => !!c),
    [cameraIds, cameras.data]
  );

  function handleSkip(deltaSec: number) {
    seekTo(globalTimeMs + deltaSec * 1000);
  }

  function bumpSpeed(dir: 1 | -1) {
    const idx = SPEEDS.indexOf(speed);
    const next = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, idx + dir))];
    if (next !== undefined) setSpeed(next);
  }

  return (
    <AppShell mainClassName="overflow-hidden">
      <div className="flex h-full overflow-hidden">
        {/* Left rail */}
        <CameraSelectorPanel className="w-[300px] flex-shrink-0" />

        {/* Right column */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="flex h-[52px] flex-shrink-0 items-center justify-between border-b border-border-subtle bg-canvas-raised px-5">
            <div className="flex items-baseline gap-3">
              <h1 className="text-[18px] font-semibold tracking-tight text-text-primary">
                Playback
              </h1>
              <span className="font-mono text-[11px] text-text-tertiary">
                {selectedCameras.length} camera{selectedCameras.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {primaryCameraId && selectedCameras.length > 1 && (
                <Badge variant="active" className="font-mono text-[10px] uppercase tracking-[0.08em]">
                  Primary: {selectedCameras.find((c) => c.id === primaryCameraId)?.name ?? "—"}
                </Badge>
              )}
            </div>
          </div>

          {/* Tile grid */}
          <div className="flex-1 overflow-hidden p-3">
            {selectedCameras.length === 0 ? (
              <EmptyTilesState />
            ) : (
              <PlaybackTileGrid cameras={selectedCameras} />
            )}
          </div>

          {/* Transport bar */}
          <div className="flex h-[64px] flex-shrink-0 items-center gap-6 border-t border-border-subtle bg-canvas-raised px-5">
            <ClockDisplay timeMs={globalTimeMs} />
            <div className="flex items-center gap-1.5">
              <IconBtn aria-label="Back 10s" onClick={() => handleSkip(-10)} disabled={!primaryCameraId}>
                <SkipBack className="h-4 w-4" />
              </IconBtn>
              <button
                onClick={togglePlaying}
                disabled={!primaryCameraId}
                aria-label={isPlaying ? "Pause" : "Play"}
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-full transition-all",
                  "bg-accent text-accent-on-accent hover:bg-accent-bright",
                  "disabled:opacity-40 disabled:pointer-events-none"
                )}
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
              </button>
              <IconBtn aria-label="Forward 10s" onClick={() => handleSkip(10)} disabled={!primaryCameraId}>
                <SkipForward className="h-4 w-4" />
              </IconBtn>
            </div>
            <span className="h-6 w-px bg-border" />
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-text-tertiary">
              <span className="uppercase tracking-[0.08em]">Speed</span>
              <IconBtn aria-label="Slower" onClick={() => bumpSpeed(-1)}>
                <Minus className="h-3 w-3" />
              </IconBtn>
              <span className="inline-flex h-7 min-w-[42px] items-center justify-center rounded border border-border bg-canvas-deep px-2 font-semibold text-text-primary">
                {speed}×
              </span>
              <IconBtn aria-label="Faster" onClick={() => bumpSpeed(1)}>
                <Plus className="h-3 w-3" />
              </IconBtn>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={selectedCameras.length === 0}
                onClick={() => setPlaying(false)}
              >
                <Download className="h-3.5 w-3.5" />
                Download clip
              </Button>
            </div>
          </div>

          {/* Multi-lane timeline */}
          {rangeStart && rangeEnd && selectedCameras.length > 0 && (
            <MultiLaneTimeline
              cameras={selectedCameras}
              primaryCameraId={primaryCameraId}
              onSelectPrimary={setPrimary}
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              globalTimeMs={globalTimeMs}
              onSeek={(ms) => seekTo(ms)}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

// ─── Bits ────────────────────────────────────────────────────────────────────

function ClockDisplay({ timeMs }: { timeMs: number }) {
  const d = new Date(timeMs);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  const datePart = d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  const wday = d.toLocaleDateString(undefined, { weekday: "short" });
  return (
    <div className="font-mono leading-tight">
      <div className="text-[20px] font-semibold tabular-nums tracking-tight text-text-primary">
        {hh}:{mm}:{ss}<span className="text-text-tertiary">.{ms}</span>
      </div>
      <div className="text-[10.5px] uppercase tracking-[0.08em] text-text-tertiary">
        {datePart} · {wday}
      </div>
    </div>
  );
}

function IconBtn({
  children, onClick, disabled, ...rest
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  "aria-label": string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-surface text-text-secondary",
        "transition-colors hover:bg-surface-hover hover:text-text-primary",
        "disabled:opacity-40 disabled:pointer-events-none"
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

function EmptyTilesState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface">
          <Film className="h-5 w-5 text-text-tertiary" />
        </div>
        <p className="text-[15px] font-semibold text-text-primary">
          Pick cameras to play back
        </p>
        <p className="max-w-sm text-[13px] text-text-secondary">
          Select one or more cameras from the left to start. Each one gets its
          own tile; they all play synchronized to the same time.
        </p>
        <div className="mt-2 inline-flex items-center gap-1.5 rounded border border-border-subtle bg-canvas-raised px-2.5 py-1 font-mono text-[10.5px] text-text-tertiary">
          <AlertCircle className="h-3 w-3" />
          Tip: click a tile to make it the primary (it drives time forward)
        </div>
      </div>
    </div>
  );
}
