import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Film, Loader2 } from "lucide-react";

import { cn } from "@/lib/cn";
import { AppShell } from "@/components/layout/AppShell";
import { DateTimePicker } from "@/components/playback/DateTimePicker";
import { PlaybackControls } from "@/components/playback/PlaybackControls";
import { Timeline } from "@/components/playback/Timeline";
import { useCameras } from "@/hooks/useCameras";
import { useRecordings } from "@/hooks/usePlayback";
import {
  fetchPlaybackDataUrl,
  type RecordingSegment,
} from "@/api/playback";
import { usePlaybackStore } from "@/stores/playback";
import { formatLocal, rangeSeconds } from "@/lib/time";

// ─── PlaybackPage ─────────────────────────────────────────────────────────────
//
// Segment-by-segment playback. We fetch all recordings in the visible range,
// paint a green bar on the timeline for each, and only allow clicking *on*
// those bars. Clicking a bar loads that one segment via
// /api/recordings/{id}/playback, seeking partway in if the click landed
// mid-bar. When playback hits the end of a segment we auto-advance to the
// next chronologically adjacent one.
//
// The video element can't send Bearer headers, so we fetch the fMP4 binary
// ourselves and hand it to <video> as a blob: URL.

export function PlaybackPage() {
  const cameras = useCameras();
  const {
    cameraId, rangeStart, rangeEnd,
    activeSegmentId, seekWithinSegmentSec,
    currentOffset, isPlaying, speed,
    setCamera, setRange, selectSegment, setCurrentOffset,
    setPlaying, togglePlaying, setSpeed,
  } = usePlaybackStore();

  // Seed first camera once cameras load.
  useEffect(() => {
    if (!cameraId && cameras.data && cameras.data.length > 0) {
      setCamera(cameras.data[0]!.id);
    }
  }, [cameras.data, cameraId, setCamera]);

  // Recordings for the visible range — drives the timeline bars and the
  // segment we feed to the player.
  const recordings = useRecordings(
    cameraId,
    rangeStart && rangeEnd ? { from: rangeStart, to: rangeEnd } : undefined
  );

  // Sort ascending (oldest first) so timeline reads left→right chronologically
  // and "next segment" really is the next one in time.
  const segments = useMemo<RecordingSegment[]>(() => {
    const list = recordings.data?.segments ?? [];
    return [...list].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  }, [recordings.data]);

  const totalSeconds = rangeStart && rangeEnd ? rangeSeconds(rangeStart, rangeEnd) : 0;

  // Auto-select the first segment when the camera/range changes (or when
  // segments finish loading) and nothing is selected yet.
  useEffect(() => {
    if (!cameraId || !rangeStart || !rangeEnd) return;
    if (segments.length === 0) {
      if (activeSegmentId !== null) selectSegment(null);
      return;
    }
    const stillExists = segments.some((s) => s.id === activeSegmentId);
    if (!stillExists) {
      selectSegment(segments[0]!.id, 0);
    }
  }, [cameraId, rangeStart, rangeEnd, segments, activeSegmentId, selectSegment]);

  const activeSegment = useMemo(
    () => segments.find((s) => s.id === activeSegmentId) ?? null,
    [segments, activeSegmentId]
  );

  // Absolute-time offset (since rangeStart) of the active segment's start —
  // used to convert video.currentTime → display offset and to seed the
  // scrubber when the segment changes.
  const segmentBaseOffsetSec = useMemo(() => {
    if (!activeSegment || !rangeStart) return 0;
    return (Date.parse(activeSegment.started_at) - Date.parse(rangeStart)) / 1000;
  }, [activeSegment, rangeStart]);

  // Imperative single-segment blob loader.
  const blob = useSegmentBlob();

  // (Re-)load the active segment whenever it changes. Re-runs on seek-into
  // changes too (so clicking the same segment at a different point reloads
  // with a fresh seek target).
  useEffect(() => {
    if (!activeSegmentId) {
      blob.reset();
      return;
    }
    blob.load(activeSegmentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSegmentId]);

  // Auto-advance: when the current segment ends, hop to the next one.
  const handleEnded = useCallback(() => {
    if (!activeSegment) {
      setPlaying(false);
      return;
    }
    const idx = segments.findIndex((s) => s.id === activeSegment.id);
    const next = idx >= 0 ? segments[idx + 1] : undefined;
    if (next) {
      selectSegment(next.id, 0);
      // Keep playing through the hand-off.
      setPlaying(true);
    } else {
      setPlaying(false);
    }
  }, [activeSegment, segments, selectSegment, setPlaying]);

  // Timeline interaction. Find the segment under the cursor; ignore clicks
  // on dead zones.
  const handleSeekCommit = useCallback(
    (offsetSec: number) => {
      if (!rangeStart) return;
      const clickedAtMs = Date.parse(rangeStart) + offsetSec * 1000;
      const hit = segments.find((s) => {
        const a = Date.parse(s.started_at);
        const b = Date.parse(s.ended_at);
        return clickedAtMs >= a && clickedAtMs < b;
      });
      if (!hit) return; // dead zone — no recording here
      const within = (clickedAtMs - Date.parse(hit.started_at)) / 1000;
      selectSegment(hit.id, Math.max(0, within));
      setPlaying(true);
    },
    [rangeStart, segments, selectSegment, setPlaying]
  );

  // Skip ±N. Stay within the current segment when possible; otherwise hop.
  const handleSkip = useCallback(
    (delta: number) => {
      if (!activeSegment) return;
      const within = Math.max(0, currentOffset - segmentBaseOffsetSec + delta);
      if (within >= 0 && within < activeSegment.duration_seconds) {
        selectSegment(activeSegment.id, within);
        return;
      }
      // Cross-segment skip: walk to neighboring segments.
      const idx = segments.findIndex((s) => s.id === activeSegment.id);
      if (delta > 0) {
        const next = segments[idx + 1];
        if (next) selectSegment(next.id, 0);
      } else {
        const prev = segments[idx - 1];
        if (prev) selectSegment(prev.id, Math.max(0, prev.duration_seconds - 1));
      }
    },
    [activeSegment, currentOffset, segmentBaseOffsetSec, segments, selectSegment]
  );

  return (
    <AppShell mainClassName="overflow-hidden">
      <div className="flex h-full flex-col overflow-hidden">

        {/* Header: camera + range pickers */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle bg-canvas-raised px-4 py-2.5">
          <CameraPicker
            cameras={cameras.data ?? []}
            value={cameraId}
            onChange={setCamera}
          />
          <span className="h-4 w-px bg-border" />
          {rangeStart && rangeEnd && (
            <DateTimePicker
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              onChange={setRange}
            />
          )}
          <span className="ml-auto font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-tertiary">
            {recordings.isLoading
              ? "Loading…"
              : segments.length === 0
                ? "No recordings in range"
                : `${segments.length} segments`}
          </span>
        </div>

        {/* Player */}
        <div className="flex flex-1 items-center justify-center overflow-hidden bg-black p-1">
          {!cameraId ? (
            <EmptyState
              icon={Film}
              title="Select a camera"
              hint="Pick a camera above to view its recordings."
            />
          ) : recordings.isError ? (
            <EmptyState
              icon={AlertTriangle}
              title="Couldn't load recordings"
              hint={(recordings.error as Error | undefined)?.message ?? "Try again."}
              variant="error"
            />
          ) : recordings.isLoading ? (
            <LoadingState label="Loading recordings…" />
          ) : segments.length === 0 ? (
            <EmptyState
              icon={Film}
              title="No recordings in this range"
              hint="Adjust the date range below — or click a green segment on the timeline."
            />
          ) : blob.state === "error" ? (
            <EmptyState
              icon={AlertTriangle}
              title="Playback failed"
              hint={blob.error ?? "Try a different segment."}
              variant="error"
            />
          ) : blob.state === "loading" || !blob.url ? (
            <LoadingState label="Loading segment…" />
          ) : (
            <SegmentVideo
              blobUrl={blob.url}
              seekWithinSec={seekWithinSegmentSec}
              segmentBaseOffsetSec={segmentBaseOffsetSec}
              isPlaying={isPlaying}
              speed={speed}
              onAbsoluteOffsetChange={setCurrentOffset}
              onEnded={handleEnded}
            />
          )}
        </div>

        {/* Timeline */}
        {rangeStart && rangeEnd && (
          <div className="border-t border-border-subtle bg-canvas-raised px-4 py-3">
            <Timeline
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              segments={segments}
              activeSegmentId={activeSegmentId}
              offsetSeconds={currentOffset}
              onSeekCommit={handleSeekCommit}
            />
            <div className="mt-1.5 flex items-center justify-between font-mono text-[10.5px] text-text-tertiary">
              <span>{formatLocal(rangeStart)}</span>
              <span>{formatLocal(rangeEnd)}</span>
            </div>
          </div>
        )}

        {/* Transport */}
        <PlaybackControls
          isPlaying={isPlaying}
          onPlayPause={togglePlaying}
          onSkip={handleSkip}
          speed={speed}
          onSpeedChange={setSpeed}
          currentSeconds={currentOffset}
          totalSeconds={totalSeconds}
          disabled={segments.length === 0 || blob.state !== "ready"}
        />
      </div>
    </AppShell>
  );
}

// ─── useSegmentBlob ───────────────────────────────────────────────────────────
// Imperative: given a recording id, fetch its playback URL → fetch fMP4 with
// Bearer → make blob URL. One segment at a time; reloading swaps URLs.

type BlobState = "idle" | "loading" | "ready" | "error";

function useSegmentBlob() {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<BlobState>("idle");
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);

  const load = useCallback(async (segmentId: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setState("loading");
    setError(null);

    try {
      if (ac.signal.aborted) return;

      const dataUrl = await fetchPlaybackDataUrl(segmentId, ac.signal);
      if (ac.signal.aborted) return;

      if (urlRef.current && urlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(urlRef.current);
      }
      urlRef.current = dataUrl;
      setUrl(dataUrl);
      setState("ready");
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return;
      console.error("[useSegmentBlob] error:", (e as Error).message);
      setError((e as Error).message);
      setState("error");
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (urlRef.current && urlRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(urlRef.current);
    }
    urlRef.current = null;
    setUrl(null);
    setState("idle");
    setError(null);
  }, []);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (urlRef.current && urlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(urlRef.current);
      }
    },
    []
  );

  return { url, state, error, load, reset };
}

// ─── SegmentVideo ─────────────────────────────────────────────────────────────
// Plays one segment. Reports absolute offset (segmentBase + video.currentTime)
// back to the parent so the scrubber stays in sync. Honors seekWithinSec when
// the segment first loads so mid-segment clicks land at the right position.

function SegmentVideo({
  blobUrl,
  seekWithinSec,
  segmentBaseOffsetSec,
  isPlaying,
  speed,
  onAbsoluteOffsetChange,
  onEnded,
}: {
  blobUrl: string;
  seekWithinSec: number;
  segmentBaseOffsetSec: number;
  isPlaying: boolean;
  speed: number;
  onAbsoluteOffsetChange: (s: number) => void;
  onEnded: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // When a new segment loads, apply seek-within once metadata is ready,
  // then auto-play.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const onReady = () => {
      if (seekWithinSec > 0 && isFinite(el.duration) && seekWithinSec < el.duration) {
        el.currentTime = seekWithinSec;
      }
      el.play().catch(() => {}); // ignore transient errors
    };

    if (el.readyState >= 3) {
      onReady();
    } else {
      el.addEventListener("canplay", onReady, { once: true });
    }
    return () => el.removeEventListener("canplay", onReady);
  }, [blobUrl, seekWithinSec]);

  // Drive play/pause from store — only when the user explicitly toggles.
  // Don't call play() if the video isn't ready yet (readyState < 3).
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (isPlaying) {
      if (el.readyState >= 3) {
        el.play().catch(() => {/* ignore — canplay handler will retry */});
      }
    } else {
      if (!el.paused) el.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    const el = videoRef.current;
    if (el) el.playbackRate = speed;
  }, [speed, blobUrl]);

  return (
    <video
      ref={videoRef}
      src={blobUrl}
      className="h-full w-full object-contain"
      playsInline
      muted
      controls
      onTimeUpdate={(e) =>
        onAbsoluteOffsetChange(segmentBaseOffsetSec + e.currentTarget.currentTime)
      }
      onEnded={onEnded}
    />
  );
}

// ─── CameraPicker ─────────────────────────────────────────────────────────────

function CameraPicker({
  cameras,
  value,
  onChange,
}: {
  cameras: { id: string; name: string }[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <label className="inline-flex h-7 items-center gap-1.5 rounded-[3px] border border-border bg-canvas-deep pl-2 pr-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-tertiary">
        Camera
      </span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-full min-w-[160px] bg-transparent pr-1 font-mono text-[11.5px] text-text-primary outline-none",
          "[color-scheme:dark]"
        )}
      >
        {cameras.length === 0 && <option value="">No cameras</option>}
        {cameras.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

// ─── States ───────────────────────────────────────────────────────────────────

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <Loader2 className="h-6 w-6 animate-spin text-accent" />
      <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-tertiary">
        {label}
      </span>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  hint,
  variant = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  variant?: "default" | "error";
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 text-center">
      <Icon
        className={cn(
          "h-8 w-8",
          variant === "error" ? "text-status-critical" : "text-text-disabled"
        )}
      />
      <div>
        <p className="text-[14px] font-medium text-text-primary">{title}</p>
        <p className="mt-1 max-w-md text-[12.5px] text-text-secondary">{hint}</p>
      </div>
    </div>
  );
}
