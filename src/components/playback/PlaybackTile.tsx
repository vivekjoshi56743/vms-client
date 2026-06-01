import { useEffect, useMemo, useRef } from "react";
import { Loader2, AlertTriangle, VideoOff } from "lucide-react";

import { cn } from "@/lib/cn";
import { useRecordings } from "@/hooks/usePlayback";
import { usePlaybackStore } from "@/stores/playback";
import { useSegmentBlob } from "@/lib/segment-blob";
import type { RecordingSegment } from "@/api/playback";

interface Props {
  cameraId: string;
  cameraName: string;
  className?: string;
}

// Per-camera playback unit. Driven entirely by global state in the store:
// global time + isPlaying + speed. When this tile is "primary", its video's
// timeupdate pushes the store's globalTimeMs forward. Non-primary tiles only
// follow: they seek to match when the global time changes.

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

  const segments = useMemo<RecordingSegment[]>(() => {
    const list = recordings.data?.segments ?? [];
    return [...list].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  }, [recordings.data]);

  // Find the segment that covers globalTimeMs (if any).
  const activeSegment = useMemo(() => {
    return segments.find((s) => {
      const a = Date.parse(s.started_at);
      const b = Date.parse(s.ended_at);
      return globalTimeMs >= a && globalTimeMs < b;
    }) ?? null;
  }, [segments, globalTimeMs]);

  const blob = useSegmentBlob();
  const videoRef = useRef<HTMLVideoElement>(null);

  // Load segment blob when activeSegment changes.
  useEffect(() => {
    if (activeSegment) {
      blob.load(activeSegment.id);
    } else {
      blob.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSegment?.id]);

  // Seek video to (globalTime - segmentStart) when global time changes,
  // unless we're primary (we ARE the source of truth then).
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !activeSegment || isPrimary) return;
    const within = (globalTimeMs - Date.parse(activeSegment.started_at)) / 1000;
    if (within < 0 || !isFinite(within)) return;
    // Don't fight a tight loop — only adjust if drift exceeds 0.5s.
    if (Math.abs(el.currentTime - within) > 0.5) {
      el.currentTime = within;
    }
  }, [globalTimeMs, activeSegment, isPrimary]);

  // Apply play/pause from store.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (isPlaying) {
      if (el.readyState >= 3) {
        el.play().catch(() => {});
      }
    } else if (!el.paused) {
      el.pause();
    }
  }, [isPlaying, blob.url]);

  // Apply playback rate.
  useEffect(() => {
    const el = videoRef.current;
    if (el) el.playbackRate = speed;
  }, [speed, blob.url]);

  // When a new blob loads and the user expects playback to be running,
  // kick it off after metadata is ready.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !blob.url || !activeSegment) return;
    const startWithin = (globalTimeMs - Date.parse(activeSegment.started_at)) / 1000;

    const onReady = () => {
      if (startWithin > 0 && isFinite(el.duration) && startWithin < el.duration) {
        el.currentTime = startWithin;
      }
      if (isPlaying) el.play().catch(() => {});
    };

    if (el.readyState >= 3) {
      onReady();
    } else {
      el.addEventListener("canplay", onReady, { once: true });
      return () => el.removeEventListener("canplay", onReady);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob.url]);

  // Auto-advance for the primary tile only — when its segment ends, hop to
  // the next segment for this camera if there is one (otherwise pause).
  function onEnded() {
    if (!isPrimary || !activeSegment) return;
    const idx = segments.findIndex((s) => s.id === activeSegment.id);
    const next = segments[idx + 1];
    if (next) {
      reportTime(Date.parse(next.started_at));
    } else {
      setPlaying(false);
    }
  }

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
            !activeSegment
              ? "border-status-critical/30 bg-status-critical-subtle/50 text-status-critical"
              : isPlaying
                ? "border-status-online/30 bg-status-online-subtle/50 text-status-online"
                : "border-border bg-canvas-deep/60 text-text-secondary"
          )}
        >
          {!activeSegment ? "No rec" : isPlaying ? "Live" : "Paused"}
        </span>
      </div>

      {/* Recording dot */}
      {activeSegment && (
        <span className="absolute right-3 top-9 z-10 h-1.5 w-1.5 rounded-full bg-status-critical" />
      )}

      {/* Body */}
      <div className="flex flex-1 items-center justify-center">
        {!activeSegment ? (
          <NoRecordingOverlay />
        ) : blob.state === "error" ? (
          <ErrorOverlay msg={blob.error ?? "Playback failed"} />
        ) : blob.state === "loading" || !blob.url ? (
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        ) : (
          <video
            ref={videoRef}
            src={blob.url}
            className="h-full w-full object-contain"
            playsInline
            muted
            onTimeUpdate={(e) => {
              if (!isPrimary || !activeSegment) return;
              const t = Date.parse(activeSegment.started_at) + e.currentTarget.currentTime * 1000;
              reportTime(t);
            }}
            onEnded={onEnded}
          />
        )}
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
    <div className="flex flex-col items-center gap-2 text-center">
      <VideoOff className="h-6 w-6 text-text-tertiary" />
      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
        No recording at this time
      </span>
    </div>
  );
}

function ErrorOverlay({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 text-center">
      <AlertTriangle className="h-6 w-6 text-status-critical" />
      <span className="font-mono text-[10.5px] text-status-critical">{msg}</span>
    </div>
  );
}
