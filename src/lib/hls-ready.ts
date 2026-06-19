// Probe an HLS manifest until the server is actually serving a playlist.
//
// When the client requests vcodec=h264, the backend starts a transcode on
// demand — leaving a short window where the cam-{id}-h264 path isn't published
// yet and the manifest returns 404/503/empty. Handing that to hls.js surfaces
// as a fatal MANIFESTLOADERROR. Instead we poll the manifest ourselves through
// the Rust fetch (no mixed-content / self-signed-TLS issues) and only let the
// player mount once we get a real "#EXTM3U" body. The wait is unavoidable
// (ffmpeg has to produce the first segments), but this turns it into the
// normal "Connecting…" spinner instead of an error. Budget ~30s (38 × 800ms)
// to cover a slow cold transcode start before giving up.

import { tauriFetch } from "@/lib/tauri-fetch";

export async function waitForHlsReady(
  url: string,
  opts: { signal?: AbortSignal; maxAttempts?: number; intervalMs?: number } = {}
): Promise<void> {
  const { signal, maxAttempts = 38, intervalMs = 800 } = opts;
  let lastErr = "not ready";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) throw new Error("aborted");
    try {
      const resp = await tauriFetch(url, { method: "GET" });
      if (resp.ok) {
        const body = await resp.text();
        if (body.includes("#EXTM3U")) return; // server is serving a playlist
        lastErr = "empty manifest";
      } else {
        lastErr = `HTTP ${resp.status}`;
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    await delay(intervalMs, signal);
  }

  throw new Error(`stream not ready (${lastErr})`);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("aborted"));
      },
      { once: true }
    );
  });
}
