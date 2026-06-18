// Custom hls.js loader that routes manifest + segment requests through the
// Rust HTTP shim (`tauriFetch` → `tofu_http_request`) instead of hls.js's
// default XHR/fetch loader.
//
// Why this exists: hls.js loads the .m3u8 playlist and every media segment with
// its own loader, which issues requests directly from the WebView. In the
// packaged app that fails the same way the WHEP signaling did — see whep.ts:
//   • the packaged WebView serves from a SECURE origin (`tauri://localhost`),
//     so a plain-HTTP request to MediaMTX is mixed content and gets blocked,
//     surfacing as hls.js `MANIFESTLOADERROR` / `FRAGLOADERROR`;
//   • an HTTPS backend uses the self-signed cert only the Rust pinning client
//     trusts.
// Routing through Rust solves both. The loader is only installed inside Tauri
// (see VideoPlayer); in a plain browser hls.js keeps its battle-tested default.

import { LoadStats } from "hls.js";
import type {
  HlsConfig,
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
  LoaderResponse,
  LoaderStats,
} from "hls.js";

import { tauriFetch } from "@/lib/tauri-fetch";

export class TauriHlsLoader implements Loader<LoaderContext> {
  context: LoaderContext | null = null;
  stats: LoaderStats;
  private aborted = false;

  // hls.js instantiates loaders with `new Loader(config)`. We don't need the
  // config, but the construct signature must accept it.
  constructor(_config?: HlsConfig) {
    this.stats = new LoadStats();
  }

  destroy(): void {
    this.abort();
    this.context = null;
  }

  abort(): void {
    this.aborted = true;
    this.stats.aborted = true;
  }

  load(
    context: LoaderContext,
    _config: LoaderConfiguration,
    callbacks: LoaderCallbacks<LoaderContext>
  ): void {
    this.context = context;
    const stats = this.stats;
    stats.loading.start = self.performance.now();

    const headers: Record<string, string> = { ...(context.headers ?? {}) };
    // hls.js range requests are [rangeStart, rangeEnd) — exclusive end; the
    // HTTP Range header is inclusive, hence the -1.
    if (typeof context.rangeEnd === "number" && context.rangeEnd > 0) {
      const start = context.rangeStart ?? 0;
      headers["Range"] = `bytes=${start}-${context.rangeEnd - 1}`;
    }

    tauriFetch(context.url, { method: "GET", headers })
      .then(async (resp) => {
        if (this.aborted) return;
        stats.loading.first = Math.max(self.performance.now(), stats.loading.start);

        if (resp.status < 200 || resp.status >= 400) {
          callbacks.onError(
            { code: resp.status, text: resp.statusText || `HTTP ${resp.status}` },
            context,
            resp,
            stats
          );
          return;
        }

        const data: string | ArrayBuffer =
          context.responseType === "arraybuffer"
            ? await resp.arrayBuffer()
            : await resp.text();
        if (this.aborted) return;

        const len = typeof data === "string" ? data.length : data.byteLength;
        stats.loading.end = Math.max(self.performance.now(), stats.loading.first);
        stats.loaded = len;
        stats.total = len;

        const response: LoaderResponse = {
          url: context.url,
          data,
          code: resp.status,
        };
        callbacks.onSuccess(response, stats, context, resp);
      })
      .catch((err) => {
        if (this.aborted) return;
        callbacks.onError(
          { code: 0, text: err instanceof Error ? err.message : String(err) },
          context,
          null,
          stats
        );
      });
  }
}
