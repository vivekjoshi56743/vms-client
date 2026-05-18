import { useQuery } from "@tanstack/react-query";

import { listRecordings } from "@/api/playback";

export function useRecordings(
  cameraId: string | null,
  range?: { from?: string; to?: string }
) {
  return useQuery({
    queryKey: ["recordings", cameraId, range?.from, range?.to],
    queryFn: () => listRecordings(cameraId!, range),
    enabled: !!cameraId,
    staleTime: 60_000,
  });
}
