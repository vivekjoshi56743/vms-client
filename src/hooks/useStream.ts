import { useQuery } from "@tanstack/react-query";
import { ensureStream } from "@/api/streams";

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
