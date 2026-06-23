// Map a codec identifier to a short display label for the tile chrome.
//
// Accepts either an RFC 6381 codec string (e.g. hls.js `level.videoCodec` like
// "hvc1.1.6.L63.0" or "avc1.64001f") or a bare MP4 sample-entry fourcc
// ("hvc1"/"hev1"/"avc1"). Returns null for unknown/empty so callers can hide
// the badge rather than show something misleading.
export function codecLabel(codec: string | null | undefined): string | null {
  if (!codec) return null;
  const c = codec.trim().toLowerCase();
  if (c.startsWith("hvc1") || c.startsWith("hev1")) return "H.265";
  if (c.startsWith("avc1") || c.startsWith("avc3")) return "H.264";
  if (c.startsWith("av01")) return "AV1";
  if (c.startsWith("vp09") || c.startsWith("vp9")) return "VP9";
  return null;
}

// Scan an MP4's first 64 KB for the video sample-entry fourcc and return its
// display label. The init/moov sits at the front of the backend's muxed fMP4,
// so the stsd (which carries the fourcc) is in range. Mirrors the Rust scan
// that does the hev1→hvc1 retag — used for playback, where the codec isn't
// otherwise exposed to JS.
export function mp4VideoCodecLabel(bytes: ArrayBuffer | Uint8Array): string | null {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const scan = Math.min(b.length, 0x10000);
  const tags: Array<[string, string]> = [
    ["hvc1", "H.265"],
    ["hev1", "H.265"],
    ["avc1", "H.264"],
    ["avc3", "H.264"],
    ["av01", "AV1"],
  ];
  for (let i = 0; i + 4 <= scan; i++) {
    for (const [tag, label] of tags) {
      if (
        b[i] === tag.charCodeAt(0) &&
        b[i + 1] === tag.charCodeAt(1) &&
        b[i + 2] === tag.charCodeAt(2) &&
        b[i + 3] === tag.charCodeAt(3)
      ) {
        return label;
      }
    }
  }
  return null;
}
