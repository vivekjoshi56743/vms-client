import { client, unwrap } from "@/api/client";
import type { components } from "@/api/schema";

export type HealthStatus = "unknown" | "online" | "degraded" | "offline";

export type CameraHealth = {
  camera_id: string;
  status: HealthStatus;
  last_checked: string;
  last_seen: string;
  last_error: string;
  bytes_received: number;
  source: string;
};

function toHealth(r: components["schemas"]["apitypes.CameraHealthResponse"]): CameraHealth {
  return {
    camera_id: r.camera_id ?? "",
    status: (r.status as HealthStatus) ?? "unknown",
    last_checked: r.last_checked ?? "",
    last_seen: r.last_seen ?? "",
    last_error: r.last_error ?? "",
    bytes_received: r.bytes_received ?? 0,
    source: r.source ?? "",
  };
}

// GET /api/cameras/health — all cameras.
export async function getAllCameraHealth(): Promise<CameraHealth[]> {
  const result = await client.GET("/api/cameras/health");
  const data = unwrap(result);
  return (data as components["schemas"]["apitypes.CameraHealthResponse"][]).map(toHealth);
}

// GET /api/cameras/{id}/health — single camera.
export async function getCameraHealth(id: string): Promise<CameraHealth> {
  const result = await client.GET("/api/cameras/{id}/health", {
    params: { path: { id } },
  });
  return toHealth(unwrap(result) as components["schemas"]["apitypes.CameraHealthResponse"]);
}

// GET /healthz — unauthenticated connectivity ping.
export async function getSystemHealth() {
  const result = await client.GET("/healthz");
  return unwrap(result);
}
