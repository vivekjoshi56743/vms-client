import { useQuery, useQueries } from "@tanstack/react-query";
import { ensureStream } from "@/api/streams";
import type { StreamURLs } from "@/api/streams";

// Fires POST /api/cameras/{id}/stream once per camera selection; result is
// cached indefinitely for the session (stream URLs don't change while the
// camera is active). Set staleTime to Infinity so switching back to a
// previously-viewed camera is instant with no re-POST.
export function useStream(cameraId: string | null) {
  return useQuery({
    queryKey: ["stream", cameraId],
    queryFn:  () => ensureStream(cameraId!),
    enabled:  !!cameraId,
    staleTime: Infinity,
    retry: 1,
  });
}

// Fires POST for every camera ID in the list in parallel.
// Returns a map of cameraId → StreamURLs (only resolved entries).
export function useStreams(cameraIds: string[]) {
  const results = useQueries({
    queries: cameraIds.map((id) => ({
      queryKey: ["stream", id],
      queryFn:  () => ensureStream(id),
      staleTime: Infinity,
      retry: 1,
    })),
  });

  const map: Record<string, { webrtc: string | null; hls: string | null }> = {};
  cameraIds.forEach((id, i) => {
    const data = results[i]?.data as StreamURLs | undefined;
    if (data) map[id] = { webrtc: data.webrtc, hls: data.hls };
  });
  return map;
}
