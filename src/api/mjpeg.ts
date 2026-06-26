import { getActiveServerUrl } from "@/api/client";
import { useAuthStore } from "@/stores/auth";
import { tauriFetch } from "@/lib/tauri-fetch";

// Backend MJPEG live (Linux path). The Go backend transcodes a camera to JPEG
// frames (HW decode → CPU mjpeg @5fps, one shared ffmpeg per camera) and exposes
// them behind a short-lived, camera-scoped signed token. We use the single-frame
// endpoint: the Linux tile polls one JPEG at a time through the Rust pinned-TLS
// proxy. (The WebView can't reach the self-signed backend directly — and the
// infinite multipart stream can't traverse the buffering Rust proxy anyway, so
// the finite per-frame response is the one that works for the desktop app.)

export interface MjpegUrls {
  /** Absolute URL of the continuous multipart stream (unused by the desktop app). */
  streamUrl: string;
  /** Absolute URL of the single-frame endpoint we poll. Carries the signed token. */
  frameUrl: string;
  /** Token lifetime in ms — used to re-mint before it expires. */
  expiresInMs: number;
}

interface MjpegTokenResponse {
  stream: string;
  frame: string;
  expires_in: number;
}

// POST /api/cameras/{id}/mjpeg/token — bearer-authed; mints a token and returns
// absolute stream + frame URLs (the token is embedded in their query string).
export async function mintMjpegToken(cameraId: string): Promise<MjpegUrls> {
  const base = getActiveServerUrl().replace(/\/$/, "");
  const token = useAuthStore.getState().token;
  const res = await tauriFetch(`${base}/api/cameras/${cameraId}/mjpeg/token`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`mjpeg token mint failed: ${res.status}`);
  const d = (await res.json()) as MjpegTokenResponse;
  return {
    streamUrl: base + d.stream,
    frameUrl: base + d.frame,
    expiresInMs: (d.expires_in ?? 300) * 1000,
  };
}

export type FrameResult = { ok: true; blob: Blob } | { ok: false; status: number };

// GET one current JPEG through the Rust proxy. Finite response → tofu_http_request
// carries it cleanly. 503 = the shared transcode is still warming (retry); 401 =
// token expired (caller re-mints).
export async function fetchMjpegFrame(frameUrl: string): Promise<FrameResult> {
  const res = await tauriFetch(frameUrl);
  if (res.ok) return { ok: true, blob: await res.blob() };
  return { ok: false, status: res.status };
}
