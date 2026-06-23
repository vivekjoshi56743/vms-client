import { create } from "zustand";

// Per-CAMERA playback codec decision, made by OBSERVING whether that camera's
// native stream actually renders on this device (see verifyVideoRenders) — not
// by a capability probe, which lies about HEVC on WebKit.
//
// We request the camera's native stream first (no vcodec — could be H.265 or
// already H.264) and just use whatever comes if it plays. We ask the backend to
// transcode to H.264 ONLY for the specific cameras whose native stream this
// device can't render — a natively-H.264 camera always plays directly, even if
// a different (H.265) camera failed. The goal is to never transcode when we can
// play what the camera already sends.
//
// Per camera:
//   undefined → not yet tested: request native and verify it paints.
//   "native"  → native stream renders here: keep using it (no transcode).
//   "h264"    → native stream stays black here: ask the backend for H.264.
type Verdict = "native" | "h264";

interface PlaybackCodecState {
  verdicts: Record<string, Verdict>;
  markNativeOk: (cameraId: string) => void;
  markNeedsH264: (cameraId: string) => void;
}

export const usePlaybackCodecStore = create<PlaybackCodecState>((set) => ({
  verdicts: {},
  markNativeOk: (cameraId) =>
    set((s) =>
      s.verdicts[cameraId] === "native"
        ? s
        : { verdicts: { ...s.verdicts, [cameraId]: "native" } }
    ),
  markNeedsH264: (cameraId) =>
    set((s) =>
      s.verdicts[cameraId] === "h264"
        ? s
        : { verdicts: { ...s.verdicts, [cameraId]: "h264" } }
    ),
}));

// The vcodec to request for a camera: "h264" only once we've confirmed its
// native stream can't render here; otherwise undefined (= native, no transcode).
export function playbackVcodecFor(verdict: Verdict | undefined): "h264" | undefined {
  return verdict === "h264" ? "h264" : undefined;
}
