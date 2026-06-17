import { client, unwrap } from "@/api/client";
import type { components } from "@/api/schema";

// NVR discovery — connect to an NVR/DVR, enumerate camera channels, and get
// back their RTSP URLs. The returned rtsp_url values are then used to add
// cameras via the normal POST /api/cameras path (see api/cameras.ts).
//
// Rule 1: api/ imports from lib/ only — no React, no hooks.

export type DiscoveredCamera = {
  name: string;
  profile_token: string;
  rtsp_url: string;
  username: string;
};

export type NVRDiscoverRequest = {
  url: string;
  username: string;
  password: string;
};

export type NVRDiscoverResult = {
  nvr_host: string;
  cameras: DiscoveredCamera[];
};

function toDiscoveredCamera(
  r: components["schemas"]["apitypes.DiscoveredCameraResponse"]
): DiscoveredCamera {
  return {
    name: r.name ?? "",
    profile_token: r.profile_token ?? "",
    rtsp_url: r.rtsp_url ?? "",
    username: r.username ?? "",
  };
}

function toResult(
  r: components["schemas"]["apitypes.NVRDiscoverResponse"]
): NVRDiscoverResult {
  return {
    nvr_host: r.nvr_host ?? "",
    cameras: (r.cameras ?? []).map(toDiscoveredCamera),
  };
}

// ─── Discovery methods ───────────────────────────────────────────────────────
// ONVIF first, Hikvision ISAPI second. Each method shares the same
// request/response shape, so adding a new one (e.g. Dahua, Axis) is a single
// entry in DISCOVERY_METHODS below — the UI renders from this registry.

export async function discoverOnvif(
  req: NVRDiscoverRequest
): Promise<NVRDiscoverResult> {
  const result = await client.POST("/api/discovery/nvr", { body: req });
  return toResult(
    unwrap(result) as components["schemas"]["apitypes.NVRDiscoverResponse"]
  );
}

export async function discoverHikvision(
  req: NVRDiscoverRequest
): Promise<NVRDiscoverResult> {
  const result = await client.POST("/api/discovery/nvr/hikvision", { body: req });
  return toResult(
    unwrap(result) as components["schemas"]["apitypes.NVRDiscoverResponse"]
  );
}

export type DiscoveryMethodId = "onvif" | "hikvision";

export type DiscoveryMethod = {
  id: DiscoveryMethodId;
  label: string;
  /** Short description shown under the method in the picker. */
  description: string;
  /** Placeholder for the connection URL field. */
  urlPlaceholder: string;
  discover: (req: NVRDiscoverRequest) => Promise<NVRDiscoverResult>;
};

// Ordered list — the UI shows these as tabs, ONVIF first. To support a new
// protocol later, add an api function above and append an entry here.
export const DISCOVERY_METHODS: DiscoveryMethod[] = [
  {
    id: "onvif",
    label: "ONVIF",
    description:
      "Standard discovery over ONVIF. Works with most modern NVRs and IP cameras.",
    urlPlaceholder: "http://192.168.1.100:80",
    discover: discoverOnvif,
  },
  {
    id: "hikvision",
    label: "Hikvision (ISAPI)",
    description:
      "Hikvision NVR/DVR via the ISAPI REST interface. Use when ONVIF is disabled on the device.",
    urlPlaceholder: "http://192.168.1.100:80",
    discover: discoverHikvision,
  },
];

export function getDiscoveryMethod(id: DiscoveryMethodId): DiscoveryMethod {
  const m = DISCOVERY_METHODS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown discovery method: ${id}`);
  return m;
}
