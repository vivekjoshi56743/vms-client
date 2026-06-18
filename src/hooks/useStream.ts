import { useQuery, useQueries } from "@tanstack/react-query";
import { ensureStream, selectLiveUrls } from "@/api/streams";
import type { StreamURLs } from "@/api/streams";
import { needsH264Stream } from "@/lib/codec";

// Whether this client must ask the backend to transcode to H.264 (WebViews
// without an HEVC decoder, e.g. Linux WebKitGTK). Stable for the session, so
// we read it once and fold it into the query key + request.
const VCODEC = needsH264Stream() ? ("h264" as const) : undefined;

// Shared query key + fetch so every entry point (useStream, useStreams, and
// LivePage's prefetch) hits the SAME cache entry and requests the SAME codec.
// VCODEC is part of the key so native and H.264 results never collide.
export function streamQueryKey(cameraId: string) {
  return ["stream", cameraId, VCODEC ?? "native"] as const;
}
export function fetchStream(cameraId: string): Promise<StreamURLs> {
  return ensureStream(cameraId, VCODEC ? { vcodec: VCODEC } : undefined);
}

// Fires POST /api/cameras/{id}/stream once per camera selection; result is
// cached indefinitely for the session (stream URLs don't change while the
// camera is active). Set staleTime to Infinity so switching back to a
// previously-viewed camera is instant with no re-POST.
export function useStream(cameraId: string | null) {
  return useQuery({
    queryKey: streamQueryKey(cameraId ?? ""),
    queryFn:  () => fetchStream(cameraId!),
    enabled:  !!cameraId,
    staleTime: Infinity,
    retry: 1,
  });
}

// Fires POST for every camera ID in the list in parallel.
// Returns a map of cameraId → live URLs (only resolved entries), already
// resolved to the H.264 variant when this client requested it.
export function useStreams(cameraIds: string[]) {
  const results = useQueries({
    queries: cameraIds.map((id) => ({
      queryKey: streamQueryKey(id),
      queryFn:  () => fetchStream(id),
      staleTime: Infinity,
      retry: 1,
    })),
  });

  const map: Record<string, { webrtc: string | null; hls: string | null }> = {};
  cameraIds.forEach((id, i) => {
    const data = results[i]?.data as StreamURLs | undefined;
    if (data) map[id] = selectLiveUrls(data);
  });
  return map;
}
