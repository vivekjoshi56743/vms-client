import { client, unwrap } from "@/api/client";

// GET /healthz — the only unauthenticated endpoint. Used for connectivity
// pings and as the Phase F3 verification target.
export async function getSystemHealth() {
  const result = await client.GET("/healthz");
  return unwrap(result);
}
