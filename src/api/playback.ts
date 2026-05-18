import { client, unwrap } from "@/api/client";
import type { components } from "@/api/schema";

import { useAuthStore } from "@/stores/auth";

export type RecordingSegment = {
  id: string;
  camera_id: string;
  started_at: string;   // RFC3339
  ended_at: string;     // RFC3339
  duration_seconds: number;
  size_bytes: number;
  storage_key: string;
};

function toSegment(r: components["schemas"]["apitypes.RecordingSegment"]): RecordingSegment {
  return {
    id: r.id ?? "",
    camera_id: r.camera_id ?? "",
    started_at: r.started_at ?? "",
    ended_at: r.ended_at ?? "",
    duration_seconds: r.duration_seconds ?? 0,
    size_bytes: r.size_bytes ?? 0,
    storage_key: r.storage_key ?? "",
  };
}

// GET /api/cameras/{id}/recordings — list segments for a camera.
export async function listRecordings(
  cameraId: string,
  range?: { from?: string; to?: string; limit?: number; offset?: number }
): Promise<{ segments: RecordingSegment[]; total: number }> {
  const result = await client.GET("/api/cameras/{id}/recordings", {
    params: { path: { id: cameraId }, query: range },
  });
  const data = unwrap(result) as components["schemas"]["apitypes.RecordingListResponse"];
  return {
    segments: (data.segments ?? []).map(toSegment),
    total: data.total ?? 0,
  };
}

// Returns a proxy:// URL that streams the segment through our Rust backend.
// Rust will dynamically convert HEVC 'hev1' tags to 'hvc1' on the fly to
// satisfy WebKit's strict codec requirements.
//
// We pass both the bearer token AND the active backend origin via query
// string. Rust uses `host` to build the upstream URL (so this works for
// any server, not just localhost:8443) and `token` to authorize the call.
export async function fetchPlaybackDataUrl(
  segmentId: string,
  _signal?: AbortSignal
): Promise<string> {
  const { token, serverUrl } = useAuthStore.getState();
  if (!token) throw new Error("Not authenticated");
  if (!serverUrl) throw new Error("No active server");

  const params = new URLSearchParams({ token, host: serverUrl });
  return `proxy://localhost/${segmentId}?${params.toString()}`;
}

