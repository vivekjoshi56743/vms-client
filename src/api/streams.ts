import { client, unwrap } from "@/api/client";
import type { components } from "@/api/schema";

export type StreamURLs = {
  camera_id: string;
  path: string;
  hls: string | null;
  webrtc: string | null;   // WHEP endpoint
  rtsp: string | null;
  rtmp: string | null;
  srt: string | null;
  // Present only when vcodec=h264 was requested (backend contract). The h264
  // URLs carry guaranteed-H.264 video playable on every WebView; when the
  // camera is already H.264 they point at the native path with no transcode.
  h264_path: string | null;
  hls_h264: string | null;
  webrtc_h264: string | null;
  h264_transcode: boolean;
};

// POST /api/cameras/{id}/stream — idempotent in MediaMTX; calling multiple
// times for the same camera returns the same URLs. Pass { vcodec: "h264" } to
// additionally request the guaranteed-H.264 variant — the live path only does
// this once it has OBSERVED that a camera's native stream can't render here
// (see VideoTile + the liveCodec store).
export async function ensureStream(
  cameraId: string,
  opts?: { vcodec?: "h264" }
): Promise<StreamURLs> {
  const result = await client.POST("/api/cameras/{id}/stream", {
    params: {
      path: { id: cameraId },
      ...(opts?.vcodec ? { query: { vcodec: opts.vcodec } } : {}),
    },
  });
  const r = unwrap(result) as components["schemas"]["apitypes.StreamURLs"];
  return {
    camera_id: r.camera_id ?? cameraId,
    path:      r.path      ?? "",
    hls:       r.hls       ?? null,
    webrtc:    r.webrtc    ?? null,
    rtsp:      r.rtsp      ?? null,
    rtmp:      r.rtmp      ?? null,
    srt:       r.srt       ?? null,
    h264_path:      r.h264_path      ?? null,
    hls_h264:       r.hls_h264       ?? null,
    webrtc_h264:    r.webrtc_h264    ?? null,
    h264_transcode: r.h264_transcode ?? false,
  };
}

// Pick the live URLs a player should use. When the H.264 variant is present
// (i.e. vcodec=h264 was requested and the server returned it — contract req
// #5: presence of hls_h264 identifies the variant), prefer it; otherwise use
// the native URLs. WHEP stays preferred over HLS within whichever set we pick.
export function selectLiveUrls(
  s: StreamURLs
): { webrtc: string | null; hls: string | null } {
  if (s.hls_h264) {
    return { webrtc: s.webrtc_h264, hls: s.hls_h264 };
  }
  return { webrtc: s.webrtc, hls: s.hls };
}
