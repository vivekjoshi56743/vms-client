import { useQuery } from "@tanstack/react-query";

import { mintMjpegToken } from "@/api/mjpeg";

// Mints (and auto-re-mints) the MJPEG stream token for a camera. The token is
// short-lived; each single-frame poll re-validates it, so we refresh at ~0.75 ×
// its lifetime to stay ahead of expiry without churn. The component re-mints
// immediately on a 401 too (belt-and-suspenders), via refetch().
export function useMjpegToken(cameraId: string) {
  return useQuery({
    queryKey: ["mjpeg-token", cameraId],
    queryFn: () => mintMjpegToken(cameraId),
    enabled: !!cameraId,
    staleTime: Infinity,
    refetchInterval: (query) => {
      const ms = query.state.data?.expiresInMs;
      return ms ? Math.max(30_000, Math.floor(ms * 0.75)) : 180_000;
    },
    retry: 1,
  });
}
