// Codec capability detection — decides whether this client must ask the
// backend for an H.264 stream instead of the camera's native one.
//
// Many cameras publish HEVC/H.265. HEVC decodes fine on WKWebView (macOS) and
// WebView2 *with* the OS HEVC codec (most Windows), but NOT on WebKitGTK
// (Linux) and not on a Windows box missing the HEVC extension. H.264 decodes
// everywhere. So when this WebView can't decode HEVC we request the backend's
// guaranteed-H.264 variant (POST /api/cameras/{id}/stream?vcodec=h264).
//
// This is a capability probe used to PICK which server stream to pull — not a
// runtime dependency on the WebView decoding something it can't. The transcode
// happens server-side; the client only chooses.

// A representative HEVC (Main profile) codec string. If the WebView can decode
// HEVC at all, one of the two probes below returns truthy.
const HEVC_PROBE = 'video/mp4; codecs="hvc1.1.6.L93.B0"';

let cached: boolean | null = null;

/** True if this WebView can decode HEVC/H.265 video. */
export function canDecodeHevc(): boolean {
  if (cached !== null) return cached;

  let supported = false;
  // hls.js plays through MSE, so MediaSource is the decode path that matters.
  if (
    typeof MediaSource !== "undefined" &&
    typeof MediaSource.isTypeSupported === "function" &&
    MediaSource.isTypeSupported(HEVC_PROBE)
  ) {
    supported = true;
  }
  // Native playback fallback (e.g. WKWebView reports HEVC via canPlayType even
  // when MediaSource.isTypeSupported is conservative).
  if (!supported && typeof document !== "undefined") {
    const v = document.createElement("video");
    if (v.canPlayType(HEVC_PROBE) !== "") supported = true;
  }

  cached = supported;
  return supported;
}

/**
 * True if this client should request the backend's H.264 variant — i.e. it
 * can't decode the cameras' native HEVC. Drives the `vcodec=h264` query param.
 */
export function needsH264Stream(): boolean {
  return !canDecodeHevc();
}
