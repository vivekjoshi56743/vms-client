import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  addCamera,
  deleteCamera,
  getCameras,
  getCamera,
  patchCamera,
  type CreateCameraInput,
  type PatchCameraInput,
} from "@/api/cameras";
import { getAllCameraHealth, getCameraHealth } from "@/api/health";

// ─── Cameras ─────────────────────────────────────────────────────────────────

export function useCameras() {
  return useQuery({
    queryKey: ["cameras"],
    queryFn: getCameras,
  });
}

export function useCamera(id: string) {
  return useQuery({
    queryKey: ["cameras", id],
    queryFn: () => getCamera(id),
    enabled: !!id,
  });
}

export function useAddCamera() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCameraInput) => addCamera(input),
    onSuccess: (camera) => {
      // Optimistic-style: insert into the list cache immediately.
      queryClient.setQueryData<Awaited<ReturnType<typeof getCameras>>>(
        ["cameras"],
        (old) => (old ? [...old, camera] : [camera])
      );
      // Then full refetch to get server-canonical state.
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      toast.success(`Camera "${camera.name}" added`);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function usePatchCamera() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PatchCameraInput }) =>
      patchCamera(id, input),
    onSuccess: (camera) => {
      queryClient.setQueryData(["cameras", camera.id], camera);
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      toast.success("Camera updated");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useDeleteCamera() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCamera(id),
    onSuccess: (_data, id) => {
      // Remove from list cache immediately.
      queryClient.setQueryData<Awaited<ReturnType<typeof getCameras>>>(
        ["cameras"],
        (old) => old?.filter((c) => c.id !== id) ?? []
      );
      queryClient.removeQueries({ queryKey: ["cameras", id] });
      queryClient.removeQueries({ queryKey: ["cameras", id, "health"] });
      toast.success("Camera deleted");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

// ─── Health ──────────────────────────────────────────────────────────────────

export function useAllCameraHealth() {
  return useQuery({
    queryKey: ["cameras", "health"],
    queryFn: getAllCameraHealth,
    refetchInterval: 15_000,
  });
}

export function useCameraHealth(id: string) {
  return useQuery({
    queryKey: ["cameras", id, "health"],
    queryFn: () => getCameraHealth(id),
    enabled: !!id,
    refetchInterval: 15_000,
  });
}
