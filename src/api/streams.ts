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
};

// POST /api/cameras/{id}/stream — idempotent in MediaMTX; calling multiple
// times for the same camera returns the same URLs.
export async function ensureStream(cameraId: string): Promise<StreamURLs> {
  const result = await client.POST("/api/cameras/{id}/stream", {
    params: { path: { id: cameraId } },
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
  };
}
