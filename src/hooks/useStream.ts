import { useQuery, useQueries } from "@tanstack/react-query";
import { ensureStream, selectLiveUrls } from "@/api/streams";
import type { StreamURLs } from "@/api/streams";
import { useLiveCodecStore, liveVcodecFor } from "@/stores/liveCodec";

// Codec is PER CAMERA and decided by OBSERVED playback (see VideoTile + the
// liveCodec store), not a capability probe. Default is the camera's native
// stream (no transcode); we request H.264 only for cameras whose native stream
// this device couldn't actually render. The vcodec is part of the query key so
// flipping a camera to H.264 transparently refetches its (transcoded) URLs.
export function streamQueryKey(cameraId: string, vcodec: "h264" | undefined) {
  return ["stream", cameraId, vcodec ?? "native"] as const;
}
export function fetchStream(
  cameraId: string,
  vcodec: "h264" | undefined
): Promise<StreamURLs> {
  return ensureStream(cameraId, vcodec ? { vcodec } : undefined);
}

// Fires POST /api/cameras/{id}/stream once per camera selection; result is
// cached indefinitely for the session (stream URLs don't change while the
// camera is active). Set staleTime to Infinity so switching back to a
// previously-viewed camera is instant with no re-POST.
export function useStream(cameraId: string | null) {
  const verdict = useLiveCodecStore((s) => (cameraId ? s.verdicts[cameraId] : undefined));
  const vcodec = liveVcodecFor(verdict);
  return useQuery({
    queryKey: streamQueryKey(cameraId ?? "", vcodec),
    queryFn:  () => fetchStream(cameraId!, vcodec),
    enabled:  !!cameraId,
    staleTime: Infinity,
    retry: 1,
  });
}

// Fires POST for every camera ID in the list in parallel.
// Returns a map of cameraId → live URLs (only resolved entries), each resolved
// to that camera's native or H.264 variant per its observed verdict.
export function useStreams(cameraIds: string[]) {
  const verdicts = useLiveCodecStore((s) => s.verdicts);
  const results = useQueries({
    queries: cameraIds.map((id) => {
      const vcodec = liveVcodecFor(verdicts[id]);
      return {
        queryKey: streamQueryKey(id, vcodec),
        queryFn:  () => fetchStream(id, vcodec),
        staleTime: Infinity,
        retry: 1,
      };
    }),
  });

  const map: Record<string, { webrtc: string | null; hls: string | null }> = {};
  cameraIds.forEach((id, i) => {
    const data = results[i]?.data as StreamURLs | undefined;
    if (data) map[id] = selectLiveUrls(data);
  });
  return map;
}
