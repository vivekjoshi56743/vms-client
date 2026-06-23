import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, AlertTriangle, VideoOff } from "lucide-react";

import { cn } from "@/lib/cn";
import { useRecordings } from "@/hooks/usePlayback";
import { usePlaybackStore } from "@/stores/playback";
import { fetchPlaybackWindow, type RecordingSegment } from "@/api/playback";
import { usePlaybackCodecStore, playbackVcodecFor } from "@/stores/playbackCodec";
import { verifyVideoRenders } from "@/lib/verify-video";

interface Props {
  cameraId: string;
  cameraName: string;
  className?: string;
}

// Seconds of footage per playback window. The recordings have no seek index,
// so we can't byte-seek a long file; instead the backend muxes a fresh fMP4
// starting at the time we want and we play it from t=0 (see fetchPlaybackWindow).
// 60s + double-buffered prefetch keeps forward playback seamless.
const WINDOW_SECS = 60;
// Two adjacent segments closer than this count as one continuous run.
const GAP_TOL_MS = 2000;
// Cap on cached window blobs held in memory (windows are small, ~MB each).
const BLOB_CACHE_MAX = 12;

interface Win {
  startMs: number;
  durS: number;
  url: string | null; // blob: URL once fetched; null while loading
}
interface Run {
  startMs: number;
  endMs: number;
}

// Per-camera playback unit, driven by global store state (time + play + speed).
// The "primary" tile is the time master: its active video's timeupdate pushes
// globalTimeMs forward; other tiles follow it.
//
// Each window is fetched as an in-memory blob: URL via the `playback_window`
// IPC command (NOT the custom proxy:// scheme — that breaks <video> on Windows
// WebView2 / Linux WebKitGTK). Playback is double-buffered across two <video>
// elements: one plays the current window while the other prefetches the next,
// so forward playback crosses window boundaries without a stall. A seek
// reloads the active slot at the new time.
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

  // Which codec to request FOR THIS CAMERA: its native stream until we've
  // observed that native can't render here, then H.264 (see verification effect
  // below). Decided per camera, so a natively-H.264 camera never transcodes.
  const verdict = usePlaybackCodecStore((s) => s.verdicts[cameraId]);
  const markNativeOk = usePlaybackCodecStore((s) => s.markNativeOk);
  const markNeedsH264 = usePlaybackCodecStore((s) => s.markNeedsH264);
  const playbackVcodec = playbackVcodecFor(verdict);

  const recordings = useRecordings(
    cameraId,
    rangeStart && rangeEnd ? { from: rangeStart, to: rangeEnd } : undefined
  );

  // Merge segments into contiguous footage runs so windows never span a gap.
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
  const windowDur = useCallback(
    (startMs: number): number | null => {
      const run = runAt(startMs);
      if (!run) return null;
      const durS = Math.min(WINDOW_SECS, Math.ceil((run.endMs - startMs) / 1000));
      return durS >= 1 ? durS : null;
    },
    [runAt]
  );

  // ── Double-buffer state ──────────────────────────────────────────────────
  const [slots, setSlots] = useState<[Win | null, Win | null]>([null, null]);
  const [active, setActive] = useState<0 | 1>(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const v0 = useRef<HTMLVideoElement>(null);
  const v1 = useRef<HTMLVideoElement>(null);
  const videoRefs = useMemo(() => [v0, v1] as const, []);

  // blob: URL cache keyed by window startMs (+ in-flight guard).
  const blobs = useRef<Map<number, string>>(new Map());
  const inflight = useRef<Set<number>>(new Set());

  // Set a slot to the window starting at startMs (null = clear). Idempotent.
  const setSlotWindow = useCallback(
    (idx: 0 | 1, startMs: number | null) => {
      setSlots((prev) => {
        if (startMs == null) {
          if (prev[idx] == null) return prev;
          const n: [Win | null, Win | null] = [prev[0], prev[1]];
          n[idx] = null;
          return n;
        }
        if (prev[idx]?.startMs === startMs) return prev;
        const durS = windowDur(startMs);
        if (durS == null) {
          if (prev[idx] == null) return prev;
          const n: [Win | null, Win | null] = [prev[0], prev[1]];
          n[idx] = null;
          return n;
        }
        const n: [Win | null, Win | null] = [prev[0], prev[1]];
        n[idx] = { startMs, durS, url: blobs.current.get(startMs) ?? null };
        return n;
      });
    },
    [windowDur]
  );

  // Apply a freshly-loaded blob URL to whichever slot(s) want that window.
  const applyUrl = useCallback((startMs: number, url: string) => {
    setSlots((prev) => {
      let changed = false;
      const n = prev.map((s) => {
        if (s && s.startMs === startMs && s.url !== url) {
          changed = true;
          return { ...s, url };
        }
        return s;
      }) as [Win | null, Win | null];
      return changed ? n : prev;
    });
  }, []);

  // Fetch the blob for a window if not cached / already loading.
  const loadBlob = useCallback(
    (startMs: number, durS: number) => {
      const cached = blobs.current.get(startMs);
      if (cached) {
        applyUrl(startMs, cached);
        return;
      }
      if (inflight.current.has(startMs)) return;
      inflight.current.add(startMs);
      fetchPlaybackWindow(
        cameraId,
        new Date(startMs).toISOString(),
        durS,
        playbackVcodec ? { vcodec: playbackVcodec } : undefined
      )
        .then((url) => {
          blobs.current.set(startMs, url);
          // Evict oldest blobs not currently held by a slot.
          if (blobs.current.size > BLOB_CACHE_MAX) {
            const keep = new Set(
              ([0, 1] as const).map((i) => slotStarts.current[i]).filter((x): x is number => x != null)
            );
            for (const k of [...blobs.current.keys()]) {
              if (blobs.current.size <= BLOB_CACHE_MAX) break;
              if (keep.has(k)) continue;
              URL.revokeObjectURL(blobs.current.get(k)!);
              blobs.current.delete(k);
            }
          }
          applyUrl(startMs, url);
        })
        .catch((e) => setErrorMsg(e?.message ? String(e.message) : String(e)))
        .finally(() => inflight.current.delete(startMs));
    },
    [cameraId, applyUrl, playbackVcodec]
  );

  // Track current slot window starts (for eviction) + revoke all on unmount.
  const slotStarts = useRef<[number | null, number | null]>([null, null]);
  useEffect(() => {
    slotStarts.current = [slots[0]?.startMs ?? null, slots[1]?.startMs ?? null];
  }, [slots]);
  useEffect(() => {
    const cache = blobs.current;
    return () => {
      for (const url of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
    };
  }, []);

  // Fetch blobs for any slot still missing its URL.
  useEffect(() => {
    slots.forEach((s) => {
      if (s && s.url == null) loadBlob(s.startMs, s.durS);
    });
  }, [slots, loadBlob]);

  const covers = (w: Win | null, t: number) =>
    !!w && t >= w.startMs && t < w.startMs + w.durS * 1000;

  // Reconcile: ensure the active slot covers globalTimeMs.
  useEffect(() => {
    const otherIdx: 0 | 1 = active === 0 ? 1 : 0;
    if (covers(slots[active], globalTimeMs)) return;
    if (covers(slots[otherIdx], globalTimeMs)) {
      setActive(otherIdx);
      return;
    }
    setErrorMsg(null);
    setSlotWindow(active, runAt(globalTimeMs) ? globalTimeMs : null);
  }, [globalTimeMs, slots, active, runs, runAt, setSlotWindow]);

  // Prefetch the next contiguous window into the inactive slot while playing.
  useEffect(() => {
    if (!isPrimary || !isPlaying) return;
    const activeWin = slots[active];
    if (!activeWin) return;
    const nextStart = activeWin.startMs + activeWin.durS * 1000;
    if (!runAt(nextStart)) return;
    setSlotWindow(active === 0 ? 1 : 0, nextStart);
  }, [isPrimary, isPlaying, slots, active, runAt, setSlotWindow]);

  // Drive play/pause/rate: only the active video plays.
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

  // Reflect the active video's readiness as the loading spinner.
  useEffect(() => {
    const el = videoRefs[active].current;
    setLoading(!!activeWin && (!activeWin.url || !el || el.readyState < 3));
  }, [active, activeWin, videoRefs]);

  // Verify ONCE (per camera) that this camera's native stream actually paints on
  // this device. We don't trust canPlayType — we watch for a real decoded frame
  // (verifyVideoRenders). If none ever appears (black screen, even with no error
  // event), record it so this camera switches to backend H.264. Runs per tile on
  // its own active video, so each camera is judged independently.
  const probedRef = useRef(false);
  const probeCtrl = useRef<AbortController | null>(null);
  useEffect(() => {
    if (probedRef.current || verdict !== undefined) return;
    const el = videoRefs[active].current;
    if (!el || !slots[active]?.url) return; // need a loaded native window to test
    probedRef.current = true;
    const ctrl = new AbortController();
    probeCtrl.current = ctrl;
    verifyVideoRenders(el, { signal: ctrl.signal }).then((ok) => {
      if (ctrl.signal.aborted) return;
      if (ok) markNativeOk(cameraId);
      else markNeedsH264(cameraId);
    });
  }, [verdict, active, slots, videoRefs, cameraId, markNativeOk, markNeedsH264]);
  useEffect(() => () => probeCtrl.current?.abort(), []);

  // When the codec preference flips (native found unrenderable -> H.264), the
  // cached blobs are the wrong codec: drop them and reload every slot.
  const prevVcodec = useRef(playbackVcodec);
  useEffect(() => {
    if (prevVcodec.current === playbackVcodec) return;
    prevVcodec.current = playbackVcodec;
    for (const url of blobs.current.values()) URL.revokeObjectURL(url);
    blobs.current.clear();
    inflight.current.clear();
    setSlots(
      (prev) => prev.map((s) => (s ? { ...s, url: null } : s)) as [Win | null, Win | null]
    );
  }, [playbackVcodec]);

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
      reportTime(nextStart); // reconcile swaps to the prefetched slot
    } else {
      const jump = nextRunStart(win.startMs);
      if (jump != null) reportTime(jump);
      else setPlaying(false);
    }
  };

  const onError = (i: 0 | 1) => {
    if (i !== active) return;
    setLoading(false);
    // While still probing this camera's native stream, an error just means this
    // device can't decode it — the verification flips us to H.264 and reloads.
    // Don't surface an error for that expected fallback.
    if (verdict === undefined) return;
    setErrorMsg(videoRefs[i].current?.error?.message || "Playback failed");
  };

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
