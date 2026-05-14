import { client, unwrap } from "@/api/client";
import type { components } from "@/api/schema";

export type Camera = {
  id: string;
  name: string;
  rtsp_url: string;
  driver_type: string;
  username: string;
  enabled: boolean;
  record_enabled: boolean;
  record_format: string;
  record_retention_hours: number;
  record_segment_seconds: number;
  created_at: string;
};

export type CreateCameraInput = {
  name: string;
  rtsp_url: string;
  username?: string;
  password?: string;
  driver_type?: string;
};

export type PatchCameraInput = {
  record_enabled?: boolean;
  record_format?: string;
  record_retention_hours?: number;
  record_segment_seconds?: number;
};

function toCamera(r: components["schemas"]["apitypes.CameraResponse"]): Camera {
  return {
    id: r.id ?? "",
    name: r.name ?? "",
    rtsp_url: r.rtsp_url ?? "",
    driver_type: r.driver_type ?? "generic_rtsp",
    username: r.username ?? "",
    enabled: r.enabled ?? true,
    record_enabled: r.record_enabled ?? false,
    record_format: r.record_format ?? "fmp4",
    record_retention_hours: r.record_retention_hours ?? 720,
    record_segment_seconds: r.record_segment_seconds ?? 3600,
    created_at: r.created_at ?? "",
  };
}

export async function getCameras(): Promise<Camera[]> {
  const result = await client.GET("/api/cameras");
  const data = unwrap(result);
  return (data as components["schemas"]["apitypes.CameraResponse"][]).map(toCamera);
}

export async function getCamera(id: string): Promise<Camera> {
  const result = await client.GET("/api/cameras/{id}", { params: { path: { id } } });
  return toCamera(unwrap(result) as components["schemas"]["apitypes.CameraResponse"]);
}

export async function addCamera(input: CreateCameraInput): Promise<Camera> {
  const result = await client.POST("/api/cameras", { body: input });
  return toCamera(unwrap(result) as components["schemas"]["apitypes.CameraResponse"]);
}

export async function patchCamera(id: string, input: PatchCameraInput): Promise<Camera> {
  const result = await client.PATCH("/api/cameras/{id}", {
    params: { path: { id } },
    body: input,
  });
  return toCamera(unwrap(result) as components["schemas"]["apitypes.CameraResponse"]);
}

export async function deleteCamera(id: string): Promise<void> {
  const result = await client.DELETE("/api/cameras/{id}", { params: { path: { id } } });
  // 204 No Content — unwrap would throw on missing body, so check manually.
  if (!result.response.ok) {
    const status = result.response.status;
    throw new Error(`Delete failed with status ${status}`);
  }
}
