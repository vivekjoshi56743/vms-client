import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, AlertTriangle, VideoOff } from "lucide-react";

import { cn } from "@/lib/cn";
import { useRecordings } from "@/hooks/usePlayback";
import { usePlaybackStore } from "@/stores/playback";
import { buildPlaybackWindowUrl, type RecordingSegment } from "@/api/playback";

interface Props {
  cameraId: string;
  cameraName: string;
  className?: string;
}

// How many seconds of footage each playback window covers. The recordings have
// no seek index, so we can't byte-seek a 1-hour file; instead we ask the
// backend to mux a fresh fMP4 starting at the time we want (see
// `buildPlaybackWindowUrl`) and play it from t=0. Smaller windows = lower
// load latency but more frequent boundaries; larger = the reverse. 60s with
// double-buffered prefetch keeps forward playback seamless.
const WINDOW_SECS = 60;
// Two adjacent segments separated by less than this are treated as one
// continuous run (cameras restart recording on segment rollover).
const GAP_TOL_MS = 2000;

interface Win {
  startMs: number;
  durS: number;
  url: string;
}
interface Run {
  startMs: number;
  endMs: number;
}

// Per-camera playback unit, driven by global store state (time + play + speed).
// The "primary" tile is the time master: its active video's timeupdate pushes
// globalTimeMs forward. Other tiles follow globalTimeMs.
//
// Playback is double-buffered across two <video> elements (slots 0 and 1): one
// plays the current window while the other prefetches the next, so forward
// playback crosses window boundaries without a stall. A seek (globalTimeMs
// jumping outside the loaded windows) reloads the active slot at the new time.
export function PlaybackTile({ cameraId, cameraName, className }: Props) {
  const rangeStart = usePlaybackStore((s) => s.rangeStart);
  const rangeEnd = usePlaybackStore((s) => s.rangeEnd);
  const globalTimeMs = usePlaybackStore((s) => s.globalTimeMs);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const speed = usePlaybackStore((s) => s.speed);
  const primaryCameraId = usePlaybackStore((s) => s.primaryCameraId);
  const setPrimary = usePlaybackStore((s) => s.setPrimary);
  const reportTime = usePlaybackStore((s) => s.reportTime);
  const setPlaying = usePlaybackStore((s) => s.setPlaying);

  const isPrimary = primaryCameraId === cameraId;

  const recordings = useRecordings(
    cameraId,
    rangeStart && rangeEnd ? { from: rangeStart, to: rangeEnd } : undefined
  );

  // Merge segments into contiguous footage runs so windows never span a gap
  // and we know where playback must stop or jump.
  const runs = useMemo<Run[]>(() => {
    const segs = [...(recordings.data?.segments ?? [])].sort(
      (a: RecordingSegment, b: RecordingSegment) =>
        Date.parse(a.started_at) - Date.parse(b.started_at)
    );
    const out: Run[] = [];
    for (const s of segs) {
      const start = Date.parse(s.started_at);
      const end = Date.parse(s.ended_at);
      const last = out[out.length - 1];
      if (last && start - last.endMs <= GAP_TOL_MS) {
        last.endMs = Math.max(last.endMs, end);
      } else {
        out.push({ startMs: start, endMs: end });
      }
    }
    return out;
  }, [recordings.data]);

  const runAt = useCallback(
    (t: number) => runs.find((r) => t >= r.startMs && t < r.endMs) ?? null,
    [runs]
  );
  const nextRunStart = useCallback(
    (t: number) => runs.find((r) => r.startMs > t)?.startMs ?? null,
    [runs]
  );

  const clampWindow = useCallback(
    (startMs: number): Win | null => {
      const run = runAt(startMs);
      if (!run) return null;
      const durS = Math.min(WINDOW_SECS, Math.ceil((run.endMs - startMs) / 1000));
      if (durS < 1) return null;
      return {
        startMs,
        durS,
        url: buildPlaybackWindowUrl(cameraId, new Date(startMs).toISOString(), durS),
      };
    },
    [runAt, cameraId]
  );

  // ── Double-buffer state ──────────────────────────────────────────────────
  const [slots, setSlots] = useState<[Win | null, Win | null]>([null, null]);
  const [active, setActive] = useState<0 | 1>(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const v0 = useRef<HTMLVideoElement>(null);
  const v1 = useRef<HTMLVideoElement>(null);
  const videoRefs = useMemo(() => [v0, v1] as const, []);

  // Idempotent slot setter — bails when the slot already holds this window so
  // the reconcile effect converges instead of looping.
  const setSlot = useCallback((idx: 0 | 1, win: Win | null) => {
    setSlots((prev) => {
      const cur = prev[idx];
      if (cur?.startMs === win?.startMs && cur?.durS === win?.durS) return prev;
      const next: [Win | null, Win | null] = [prev[0], prev[1]];
      next[idx] = win;
      return next;
    });
  }, []);

  const covers = (w: Win | null, t: number) =>
    !!w && t >= w.startMs && t < w.startMs + w.durS * 1000;

  // Reconcile: ensure the active slot covers globalTimeMs.
  //  • already covered → nothing to do (primary plays through its window).
  //  • covered by the prefetched slot → swap to it (seamless boundary).
  //  • otherwise → (re)load the active slot at globalTimeMs (seek / initial / gap).
  useEffect(() => {
    const otherIdx: 0 | 1 = active === 0 ? 1 : 0;
    const activeWin = slots[active];
    const otherWin = slots[otherIdx];

    if (covers(activeWin, globalTimeMs)) return;
    if (covers(otherWin, globalTimeMs)) {
      setActive(otherIdx);
      return;
    }
    setErrorMsg(null);
    if (runAt(globalTimeMs)) {
      setSlot(active, clampWindow(globalTimeMs));
    } else {
      setSlot(active, null); // no footage here
    }
  }, [globalTimeMs, slots, active, runs, runAt, clampWindow, setSlot]);

  // Prefetch the next contiguous window into the inactive slot while the
  // primary tile is playing, so the boundary swap is instant.
  useEffect(() => {
    if (!isPrimary || !isPlaying) return;
    const activeWin = slots[active];
    if (!activeWin) return;
    const nextStart = activeWin.startMs + activeWin.durS * 1000;
    if (!runAt(nextStart)) return;
    const otherIdx: 0 | 1 = active === 0 ? 1 : 0;
    setSlot(otherIdx, clampWindow(nextStart));
  }, [isPrimary, isPlaying, slots, active, runAt, clampWindow, setSlot]);

  // Drive play/pause/rate: only the active video plays; the prefetch video
  // stays paused (it just buffers).
  useEffect(() => {
    videoRefs.forEach((ref, i) => {
      const el = ref.current;
      if (!el) return;
      el.playbackRate = speed;
      if (i === active && isPlaying) {
        if (el.readyState >= 2) el.play().catch(() => {});
      } else {
        el.pause();
      }
    });
  }, [active, isPlaying, speed, slots, videoRefs]);

  const activeWin = slots[active];
  const hasFootage = !!runAt(globalTimeMs);

  // ── Per-video event handlers ─────────────────────────────────────────────
  const onCanPlay = (i: 0 | 1) => {
    if (i !== active) return;
    setLoading(false);
    const el = videoRefs[i].current;
    if (el && isPlaying) el.play().catch(() => {});
  };

  const onTimeUpdate = (i: 0 | 1) => {
    if (i !== active || !isPrimary) return;
    const win = slots[i];
    const el = videoRefs[i].current;
    if (!win || !el) return;
    reportTime(win.startMs + el.currentTime * 1000);
  };

  const onWaiting = (i: 0 | 1) => {
    if (i === active) setLoading(true);
  };

  const onEnded = (i: 0 | 1) => {
    if (i !== active || !isPrimary) return;
    const win = slots[i];
    if (!win) return;
    const nextStart = win.startMs + win.durS * 1000;
    if (runAt(nextStart)) {
      // Prefetched slot should already cover this — nudge global time so
      // reconcile swaps to it.
      reportTime(nextStart);
    } else {
      const jump = nextRunStart(win.startMs);
      if (jump != null) reportTime(jump);
      else setPlaying(false);
    }
  };

  const onError = (i: 0 | 1) => {
    if (i !== active) return;
    const el = videoRefs[i].current;
    setLoading(false);
    setErrorMsg(el?.error?.message || "Playback failed");
  };

  // Reflect the active video's readiness as the loading spinner. On a seamless
  // swap to an already-buffered prefetch video this clears immediately (no new
  // `canplay` fires); on a fresh load it stays until `canplay`.
  useEffect(() => {
    const el = videoRefs[active].current;
    setLoading(!!activeWin && (!el || el.readyState < 3));
  }, [active, activeWin, videoRefs]);

  return (
    <div
      onClick={() => !isPrimary && setPrimary(cameraId)}
      className={cn(
        "relative flex flex-col overflow-hidden rounded-[3px] border bg-black",
        isPrimary ? "border-accent" : "border-border cursor-pointer",
        className
      )}
    >
      {/* Header: name + status pill */}
      <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 py-2">
        <span className="truncate font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white">
          {cameraName}
        </span>
        <span
          className={cn(
            "inline-flex h-[18px] items-center rounded-[2px] border px-1.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em]",
            !hasFootage
              ? "border-status-critical/30 bg-status-critical-subtle/50 text-status-critical"
              : isPlaying
                ? "border-status-online/30 bg-status-online-subtle/50 text-status-online"
                : "border-border bg-canvas-deep/60 text-text-secondary"
          )}
        >
          {!hasFootage ? "No rec" : isPlaying ? "Live" : "Paused"}
        </span>
      </div>

      {/* Recording dot */}
      {hasFootage && (
        <span className="absolute right-3 top-9 z-10 h-1.5 w-1.5 rounded-full bg-status-critical" />
      )}

      {/* Body — both videos stacked; only the active one is visible. */}
      <div className="relative flex flex-1 items-center justify-center">
        {([0, 1] as const).map((i) => (
          <video
            key={i}
            ref={videoRefs[i]}
            src={slots[i]?.url || undefined}
            className={cn(
              "absolute inset-0 h-full w-full object-contain",
              i === active && hasFootage ? "opacity-100" : "opacity-0"
            )}
            playsInline
            muted
            preload="auto"
            onCanPlay={() => onCanPlay(i)}
            onWaiting={() => onWaiting(i)}
            onTimeUpdate={() => onTimeUpdate(i)}
            onEnded={() => onEnded(i)}
            onError={() => onError(i)}
          />
        ))}

        {!hasFootage ? (
          <NoRecordingOverlay />
        ) : errorMsg ? (
          <ErrorOverlay msg={errorMsg} />
        ) : loading ? (
          <Loader2 className="z-10 h-6 w-6 animate-spin text-accent" />
        ) : null}
      </div>

      {/* Primary indicator */}
      {isPrimary && (
        <span className="absolute bottom-2 left-3 z-10 inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-accent">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Primary
        </span>
      )}
    </div>
  );
}

function NoRecordingOverlay() {
  return (
    <div className="z-10 flex flex-col items-center gap-2 text-center">
      <VideoOff className="h-6 w-6 text-text-tertiary" />
      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
        No recording at this time
      </span>
    </div>
  );
}

function ErrorOverlay({ msg }: { msg: string }) {
  return (
    <div className="z-10 flex flex-col items-center gap-2 px-4 text-center">
      <AlertTriangle className="h-6 w-6 text-status-critical" />
      <span className="font-mono text-[10.5px] text-status-critical">{msg}</span>
    </div>
  );
}
