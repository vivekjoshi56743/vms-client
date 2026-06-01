import { create } from "zustand";

// Multi-camera playback state.
//
// Selected cameras play synchronized off a single global time pointer
// (RFC3339 ms-since-epoch). Each PlaybackTile mounts its own segment loader
// using the existing per-camera flow (useRecordings → fetchPlaybackDataUrl
// → blob URL). The tiles all subscribe to this store: same time, same
// play/pause, same speed.
//
// "primaryCameraId" is the tile whose <video> drives forward progress.
// When that tile's currentTime advances, it pushes globalTimeMs up which
// every other tile reacts to (seeking their own video to match). Without
// a designated primary we'd have N tiles all pushing each other and
// fighting for the time pointer.

export type PlaybackSpeed = 0.5 | 1 | 2 | 4 | 8 | 16;

export const SPEEDS: PlaybackSpeed[] = [0.5, 1, 2, 4, 8, 16];

interface PlaybackState {
  /** Multi-select: which cameras are visible in the grid. */
  cameraIds: string[];
  /** Which selected tile owns forward time progression. */
  primaryCameraId: string | null;
  /** Range start (RFC3339 UTC). */
  rangeStart: string | null;
  /** Range end (RFC3339 UTC). */
  rangeEnd: string | null;
  /** Single source of truth for "now" in playback. Unix ms. */
  globalTimeMs: number;
  isPlaying: boolean;
  speed: PlaybackSpeed;

  toggleCamera: (id: string) => void;
  setCameras: (ids: string[]) => void;
  setPrimary: (id: string | null) => void;
  setRange: (start: string, end: string) => void;
  /** Authoritative seek. Pauses (caller decides to resume). */
  seekTo: (timeMs: number) => void;
  /** Used by the primary tile's timeupdate to nudge time forward. */
  reportTime: (timeMs: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => void;
  setSpeed: (speed: PlaybackSpeed) => void;
}

// Default range: previous 24 h ending now (UTC).
function defaultRange(): { rangeStart: string; rangeEnd: string; mid: number } {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return {
    rangeStart: start.toISOString(),
    rangeEnd: end.toISOString(),
    mid: start.getTime() + (end.getTime() - start.getTime()) / 2,
  };
}

export const usePlaybackStore = create<PlaybackState>()((set) => {
  const { rangeStart, rangeEnd, mid } = defaultRange();
  return {
    cameraIds: [],
    primaryCameraId: null,
    rangeStart,
    rangeEnd,
    globalTimeMs: mid,
    isPlaying: false,
    speed: 1,

    toggleCamera: (id) =>
      set((s) => {
        const has = s.cameraIds.includes(id);
        const next = has ? s.cameraIds.filter((c) => c !== id) : [...s.cameraIds, id];
        // Maintain primary: if removed, pick the first remaining (or null).
        let primary = s.primaryCameraId;
        if (has && primary === id) primary = next[0] ?? null;
        if (!has && primary === null) primary = id;
        return { cameraIds: next, primaryCameraId: primary };
      }),

    setCameras: (cameraIds) =>
      set((s) => ({
        cameraIds,
        primaryCameraId:
          s.primaryCameraId && cameraIds.includes(s.primaryCameraId)
            ? s.primaryCameraId
            : cameraIds[0] ?? null,
      })),

    setPrimary: (primaryCameraId) => set({ primaryCameraId }),

    setRange: (rangeStart, rangeEnd) =>
      set({
        rangeStart,
        rangeEnd,
        globalTimeMs:
          Date.parse(rangeStart) +
          (Date.parse(rangeEnd) - Date.parse(rangeStart)) / 2,
        isPlaying: false,
      }),

    seekTo: (globalTimeMs) => set({ globalTimeMs, isPlaying: false }),

    reportTime: (globalTimeMs) => set({ globalTimeMs }),

    setPlaying: (isPlaying) => set({ isPlaying }),
    togglePlaying: () => set((s) => ({ isPlaying: !s.isPlaying })),
    setSpeed: (speed) => set({ speed }),
  };
});
