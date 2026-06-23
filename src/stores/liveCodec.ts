import { create } from "zustand";

// Per-CAMERA LIVE codec decision, made by OBSERVING whether the camera's native
// live stream actually renders (verifyVideoRenders on the hls.js / WHEP <video>)
// — NOT by a capability probe, which lies about HEVC on WebKit (says "supported"
// then shows a black screen with no error).
//
// Kept SEPARATE from the playback verdict on purpose: live decodes through MSE
// (hls.js), playback through a plain <video>, and a WebView can support HEVC in
// one path but not the other.
//
// Per camera:
//   verdict undefined → not tested: request native, verify it paints.
//   verdict "native"  → native renders here: keep it (no transcode).
//   verdict "h264"    → native stayed black: request the backend's H.264 variant.
//
// whepUnsupported: this camera's native codec can't traverse WebRTC (HEVC always
// fails WHEP) — skip the doomed WHEP attempt and go straight to HLS while on
// native, so we don't pay a wasted signaling round-trip on every (re)mount.
type Verdict = "native" | "h264";

interface LiveCodecState {
  verdicts: Record<string, Verdict>;
  whepUnsupported: Record<string, boolean>;
  markNativeOk: (cameraId: string) => void;
  markNeedsH264: (cameraId: string) => void;
  markWhepUnsupported: (cameraId: string) => void;
}

export const useLiveCodecStore = create<LiveCodecState>((set) => ({
  verdicts: {},
  whepUnsupported: {},
  markNativeOk: (id) =>
    set((s) =>
      s.verdicts[id] === "native" ? s : { verdicts: { ...s.verdicts, [id]: "native" } }
    ),
  markNeedsH264: (id) =>
    set((s) =>
      s.verdicts[id] === "h264" ? s : { verdicts: { ...s.verdicts, [id]: "h264" } }
    ),
  markWhepUnsupported: (id) =>
    set((s) =>
      s.whepUnsupported[id] ? s : { whepUnsupported: { ...s.whepUnsupported, [id]: true } }
    ),
}));

// The vcodec to request for a camera: "h264" only once we've confirmed its
// native live stream can't render here; otherwise undefined (= native, no
// transcode).
export function liveVcodecFor(verdict: Verdict | undefined): "h264" | undefined {
  return verdict === "h264" ? "h264" : undefined;
}
