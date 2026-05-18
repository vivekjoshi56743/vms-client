import { create } from "zustand";

// Playback UI state. Server data (segments, fMP4 URL) lives in TanStack Query
// — this store only holds the user's current intent: which camera, what time
// window, which recording segment is active, and where within it to start.

export type PlaybackSpeed = 0.5 | 1 | 2 | 4 | 8 | 16;

export const SPEEDS: PlaybackSpeed[] = [0.5, 1, 2, 4, 8, 16];

interface PlaybackState {
  cameraId: string | null;
  /** Range start (RFC3339 UTC). */
  rangeStart: string | null;
  /** Range end (RFC3339 UTC). */
  rangeEnd: string | null;
  /** Segment id currently loaded into the player. */
  activeSegmentId: string | null;
  /** Seconds into the active segment to seek to on load. */
  seekWithinSegmentSec: number;
  /** Live readout: seconds offset from rangeStart (driven by <video> timeupdate). */
  currentOffset: number;
  isPlaying: boolean;
  speed: PlaybackSpeed;

  setCamera: (id: string | null) => void;
  setRange: (start: string, end: string) => void;
  /** Load a specific segment, optionally starting partway in. */
  selectSegment: (id: string | null, withinSec?: number) => void;
  setCurrentOffset: (seconds: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => void;
  setSpeed: (speed: PlaybackSpeed) => void;
}

// Default range: previous 24 h ending now (UTC).
function defaultRange(): { rangeStart: string; rangeEnd: string } {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return { rangeStart: start.toISOString(), rangeEnd: end.toISOString() };
}

export const usePlaybackStore = create<PlaybackState>()((set) => {
  const { rangeStart, rangeEnd } = defaultRange();
  return {
    cameraId: null,
    rangeStart,
    rangeEnd,
    activeSegmentId: null,
    seekWithinSegmentSec: 0,
    currentOffset: 0,
    isPlaying: false,
    speed: 1,

    setCamera: (id) =>
      set({
        cameraId: id,
        activeSegmentId: null,
        seekWithinSegmentSec: 0,
        currentOffset: 0,
        isPlaying: false,
      }),
    setRange: (rangeStart, rangeEnd) =>
      set({
        rangeStart,
        rangeEnd,
        activeSegmentId: null,
        seekWithinSegmentSec: 0,
        currentOffset: 0,
        isPlaying: false,
      }),
    selectSegment: (id, withinSec = 0) =>
      set({ activeSegmentId: id, seekWithinSegmentSec: withinSec }),
    setCurrentOffset: (currentOffset) => set({ currentOffset }),
    setPlaying: (isPlaying) => set({ isPlaying }),
    togglePlaying: () => set((s) => ({ isPlaying: !s.isPlaying })),
    setSpeed: (speed) => set({ speed }),
  };
});
