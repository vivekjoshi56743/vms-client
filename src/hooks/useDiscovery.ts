import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  getDiscoveryMethod,
  type DiscoveryMethodId,
  type NVRDiscoverRequest,
  type NVRDiscoverResult,
} from "@/api/discovery";
import { addCamera, deleteCamera, type CreateCameraInput } from "@/api/cameras";
import { ensureStream, selectLiveUrls } from "@/api/streams";

// Cameras created purely to preview a discovered feed are prefixed so they
// can be filtered out of the Cameras grid and swept up on cleanup. The only
// way to reuse the live-play logic (which needs a real camera + stream) is to
// add the camera first, so previewing temporarily creates a `temp_` camera.
export const TEMP_PREFIX = "temp_";
export const tempName = (name: string) => `${TEMP_PREFIX}${name}`;
export const isTempCamera = (name: string) => name.startsWith(TEMP_PREFIX);

// Rule 2: components consume this hook; it wraps the api/discovery functions
// in TanStack Query. Discovery is an action (not cached state), so it's a
// mutation rather than a query.

export type DiscoverVars = {
  methodId: DiscoveryMethodId;
  request: NVRDiscoverRequest;
};

export function useDiscoverCameras() {
  return useMutation<NVRDiscoverResult, Error, DiscoverVars>({
    mutationFn: ({ methodId, request }) =>
      getDiscoveryMethod(methodId).discover(request),
    onError: (err) => {
      toast.error(err.message || "Discovery failed");
    },
  });
}

// ─── Preview lifecycle ───────────────────────────────────────────────────────

export type PreviewSession = {
  cameraId: string;
  webrtc: string | null;
  hls: string | null;
};

// Silently create a `temp_` camera and resolve its live stream URLs. No
// success toast and no cameras-cache mutation — the temp camera is invisible
// to the Cameras grid (which filters `temp_`) and lives only for the preview.
export function usePreviewCamera() {
  return useMutation<PreviewSession, Error, CreateCameraInput>({
    mutationFn: async (input) => {
      const cam = await addCamera({ ...input, name: tempName(input.name) });
      // Preview the camera's native stream (no transcode). The full
      // observe-and-fall-back-to-H.264 logic lives in the live grid; a transient
      // preview just uses native.
      const stream = await ensureStream(cam.id);
      const { webrtc, hls } = selectLiveUrls(stream);
      return { cameraId: cam.id, webrtc, hls };
    },
    onError: (err) => {
      toast.error(err.message || "Preview failed");
    },
  });
}

// Silently delete a (temp) camera. Used to discard a preview and as the
// cleanup path when the dialog closes.
export function useDiscardCamera() {
  return useMutation<void, Error, string>({
    mutationFn: (id) => deleteCamera(id),
  });
}
