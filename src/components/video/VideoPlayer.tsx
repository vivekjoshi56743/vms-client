import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { connectWhep, type WhepSession } from "@/lib/whep";
import { isTauri } from "@/lib/fingerprint";
import { TauriHlsLoader } from "@/lib/hls-tauri-loader";
import { waitForHlsReady } from "@/lib/hls-ready";
import { verifyVideoRenders } from "@/lib/verify-video";
import { codecLabel } from "@/lib/codec-label";

export type PlayerState = "idle" | "connecting" | "playing" | "error";

interface Props {
  /** Primary stream URL: WHEP, HLS .m3u8, or fMP4. */
  url: string | null;
  /** HLS URL to fall back to if WHEP fails due to an unsupported codec. */
  hlsFallback?: string | null;
  className?: string;
  /** Called when playback state changes. */
  onStateChange?: (state: PlayerState) => void;
  muted?: boolean;
  controls?: boolean;
  /** Skip the WHEP attempt and go straight to HLS — set once we know this
   *  camera's native codec can't traverse WebRTC (e.g. HEVC). */
  skipWhep?: boolean;
  /** Fired after we've OBSERVED whether the stream actually rendered a frame.
   *  Provided only while attempting the native codec; false ⇒ caller should
   *  request the H.264 variant. */
  onRenderVerified?: (ok: boolean) => void;
  /** Fired when WHEP fails because the codec can't go over WebRTC. */
  onWhepUnsupported?: () => void;
  /** Reports the codec actually being played (e.g. "H.264", "H.265"). */
  onCodec?: (label: string | null) => void;
}

// URL type detection — order matters (WHEP check before generic http).
// Live streams are always WHEP or an HLS .m3u8 from MediaMTX. Direct-file
// (fMP4) playback does NOT go through VideoPlayer — it uses PlaybackTile's
// IPC→blob path, because a direct `<video src>` against the backend is blocked
// in the packaged WebView (see PlaybackTile / src-tauri/src/lib.rs).
type UrlKind = "whep" | "hls" | "unsupported";

function detectKind(url: string): UrlKind {
  const lower = url.toLowerCase();
  if (lower.includes("/whep")) return "whep";
  if (lower.includes(".m3u8")) return "hls";
  // Any other http(s) stream URL is served as HLS by the backend (MediaMTX).
  if (lower.startsWith("http")) return "hls";
  return "unsupported";
}

// WHEP needs WebRTC. WebView2 (Windows) and WKWebView (macOS) always provide it,
// but some Linux WebKitGTK builds ship without it — `RTCPeerConnection` is then
// undefined and `new RTCPeerConnection()` throws "Can't find variable". Detect
// that up front so we can use the camera's HLS stream instead of crashing.
function webrtcSupported(): boolean {
  return typeof RTCPeerConnection !== "undefined";
}

export function VideoPlayer({
  url,
  hlsFallback,
  className,
  onStateChange,
  muted = true,
  controls = false,
  skipWhep = false,
  onRenderVerified,
  onWhepUnsupported,
  onCodec,
}: Props) {
  const [state, setState] = useState<PlayerState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  // When WHEP fails due to an unsupported codec (e.g. H.265), silently
  // re-render using the HLS fallback URL instead of showing an error.
  const [hlsFallbackUrl, setHlsFallbackUrl] = useState<string | null>(null);

  const updateState = useCallback(
    (s: PlayerState) => {
      setState(s);
      onStateChange?.(s);
    },
    [onStateChange]
  );

  // Reset the WHEP→HLS codec fallback whenever the source URL changes — e.g.
  // when the camera flips from its native stream to the backend's H.264 variant
  // — so a stale fallback URL doesn't shadow the new one.
  useEffect(() => {
    setHlsFallbackUrl(null);
  }, [url]);

  if (!url) {
    return (
      <div className={cn("flex items-center justify-center bg-canvas-deep", className)}>
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-tertiary">
          No source
        </p>
      </div>
    );
  }

  const activeUrl = hlsFallbackUrl ?? url;
  let kind = detectKind(activeUrl);
  let playUrl = activeUrl;
  let unsupportedReason = "Unsupported source";

  // Use HLS instead of WHEP when either this WebView has no WebRTC (some Linux
  // WebKitGTK builds) OR we already know this camera's codec can't traverse
  // WebRTC (`skipWhep`, e.g. HEVC). `hlsFallback` is the .m3u8 the backend
  // returns alongside the WHEP URL. If there's no HLS URL to fall back to,
  // surface a clear message instead of letting WHEP throw.
  if (kind === "whep" && (skipWhep || !webrtcSupported())) {
    if (hlsFallback) {
      playUrl = hlsFallback;
      kind = "hls";
    } else {
      kind = "unsupported";
      unsupportedReason = "Live video isn't supported in this WebView";
    }
  }

  function handleError(msg: string, opts?: { whepUnsupportedCodec?: boolean; hlsFallback?: string }) {
    if (opts?.whepUnsupportedCodec && opts.hlsFallback) {
      // Codec mismatch — fall back to HLS without surfacing an error.
      setHlsFallbackUrl(opts.hlsFallback);
      return;
    }
    setError(msg);
    updateState("error");
  }

  function handleRetry() {
    setError(null);
    setHlsFallbackUrl(null);
    updateState("connecting");
    setRetryKey((k) => k + 1);
  }

  return (
    <div className={cn("relative overflow-hidden bg-black", className)}>
      {/* Player layer */}
      {kind === "whep" && (
        <WhepPlayer
          key={`whep-${playUrl}-${retryKey}`}
          url={playUrl}
          hlsFallback={hlsFallback ?? undefined}
          muted={muted}
          onPlaying={() => updateState("playing")}
          onConnecting={() => updateState("connecting")}
          onError={handleError}
          onRenderVerified={onRenderVerified}
          onWhepUnsupported={onWhepUnsupported}
          onCodec={onCodec}
        />
      )}
      {kind === "hls" && (
        <HlsPlayer
          key={`hls-${playUrl}-${retryKey}`}
          url={playUrl}
          muted={muted}
          controls={controls}
          onPlaying={() => updateState("playing")}
          onConnecting={() => updateState("connecting")}
          onError={handleError}
          onRenderVerified={onRenderVerified}
          onCodec={onCodec}
        />
      )}
      {kind === "unsupported" && (
        <div className="flex h-full w-full items-center justify-center bg-canvas-deep">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-tertiary">
            {unsupportedReason}
          </p>
        </div>
      )}

      {/* Connecting overlay — shimmer background + spinner. Replaces a pure
          black tile so the grid feels "alive" rather than dead while WHEP
          handshakes are in flight. */}
      {(state === "connecting" || state === "idle") && (
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-canvas-deep">
          {/* Shimmer wash */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(110deg, transparent 25%, rgba(34,211,238,0.06) 50%, transparent 75%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 1.6s ease-in-out infinite",
            }}
          />
          <div className="relative flex flex-col items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-video-chrome-text-muted">
              {state === "idle" ? "Waiting…" : "Connecting…"}
            </span>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {state === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <AlertTriangle className="h-6 w-6 text-status-critical" />
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-video-chrome-text-muted">
              {error ?? "Stream error"}
            </p>
            <Button variant="secondary" size="sm" onClick={handleRetry}>
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── WHEP sub-player ─────────────────────────────────────────────────────────

function WhepPlayer({
  url,
  hlsFallback,
  muted,
  onPlaying,
  onConnecting,
  onError,
  onRenderVerified,
  onWhepUnsupported,
  onCodec,
}: {
  url: string;
  hlsFallback?: string;
  muted: boolean;
  onPlaying: () => void;
  onConnecting: () => void;
  onError: (msg: string, opts?: { whepUnsupportedCodec?: boolean; hlsFallback?: string }) => void;
  onRenderVerified?: (ok: boolean) => void;
  onWhepUnsupported?: () => void;
  onCodec?: (label: string | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<WhepSession | null>(null);
  // Soft-retry counter for the "path is not configured" race. MediaMTX
  // returns the WHEP URL the moment the path is registered, but the RTSP
  // source bind happens slightly later — a freshly-added camera's first
  // WHEP attempt almost always fails with that 400. We re-render the
  // effect on each attempt to retry quietly under the connecting overlay.
  const [notReadyAttempt, setNotReadyAttempt] = useState(0);
  // Two MediaMTX warmup races we ride out under the connecting overlay:
  // path-not-configured (immediate) and no-one-publishing (RTSP source pull,
  // up to ~8s on slow networks). Budget = 12 × 800 ms ≈ 9.6 s.
  const NOT_READY_MAX_ATTEMPTS = 12;
  const NOT_READY_BACKOFF_MS = 800;

  useEffect(() => {
    onConnecting();
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let verifyCtrl: AbortController | null = null;

    const handleConnectError = (err: Error) => {
      if (cancelled) return;
      const e = err as Error & {
        whepUnsupportedCodec?: boolean;
        whepNotConfigured?: boolean;
      };
      if (e.whepNotConfigured && notReadyAttempt < NOT_READY_MAX_ATTEMPTS) {
        // Stay in "connecting" — the connecting overlay keeps the shimmer
        // up so the retry is invisible to the user.
        retryTimer = setTimeout(() => {
          if (!cancelled) setNotReadyAttempt((a) => a + 1);
        }, NOT_READY_BACKOFF_MS);
        return;
      }
      if (e.whepUnsupportedCodec) {
        // Remember so we skip the doomed WHEP attempt next time (HEVC can't go
        // over WebRTC), and fall straight to HLS for this playthrough.
        onWhepUnsupported?.();
        if (hlsFallback) {
          onError(err.message, { whepUnsupportedCodec: true, hlsFallback });
          return;
        }
      }
      onError(err.message);
    };

    connectWhep(
      url,
      (stream) => {
        if (cancelled) return;
        const el = videoRef.current;
        if (el) {
          el.srcObject = stream;
          el.play().catch(() => {/* autoplay blocked */});
          // WebRTC can't carry HEVC in this deployment, so a live WHEP stream is
          // always H.264 (HEVC cameras fail WHEP and fall to HLS).
          onCodec?.("H.264");
          // WHEP carried the camera's codec → confirm it actually paints.
          if (onRenderVerified) {
            verifyCtrl = new AbortController();
            const ctrl = verifyCtrl;
            verifyVideoRenders(el, { signal: ctrl.signal }).then((ok) => {
              if (!ctrl.signal.aborted) onRenderVerified(ok);
            });
          }
        }
        onPlaying();
      },
      handleConnectError
    )
      .then((session) => {
        if (cancelled) {
          session.close();
        } else {
          sessionRef.current = session;
        }
      })
      .catch(handleConnectError);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      verifyCtrl?.abort();
      sessionRef.current?.close();
      sessionRef.current = null;
    };
  }, [url, notReadyAttempt]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <video
      ref={videoRef}
      className="h-full w-full object-contain"
      muted={muted}
      playsInline
      autoPlay
    />
  );
}

// ─── HLS sub-player ──────────────────────────────────────────────────────────

function HlsPlayer({
  url,
  muted,
  controls,
  onPlaying,
  onConnecting,
  onError,
  onRenderVerified,
  onCodec,
}: {
  url: string;
  muted: boolean;
  controls: boolean;
  onPlaying: () => void;
  onConnecting: () => void;
  onError: (msg: string) => void;
  onRenderVerified?: (ok: boolean) => void;
  onCodec?: (label: string | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    onConnecting();

    // All three target WebViews (WKWebView, WebView2, WebKitGTK) support MSE, so
    // this always holds. We deliberately do NOT fall back to native `<video src>`
    // HLS: that fetches directly from the WebView, which is blocked in the
    // packaged app (mixed content / self-signed TLS) — the same failure the
    // custom loader exists to fix.
    if (!Hls.isSupported()) {
      onError("HLS not supported in this WebView");
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    let verifyCtrl: AbortController | null = null;
    let hls: Hls | null = null;

    const start = () => {
      if (cancelled || !videoRef.current) return;
      hls = new Hls({
        enableWorker: true,
        // Live tuning. The previous ultra-low-latency window (stay 1s behind the
        // edge, 4s buffer, lowLatencyMode) made hls.js skip forward and drop
        // frames to keep up — and on a software decoder (Linux/WebKitGTK, and the
        // AppImage) a dropped *reference* frame breaks the HEVC reference chain,
        // producing GREEN frames + stutter until the next keyframe ("Could not
        // find ref with POC" in the GStreamer log). A few seconds of buffer keeps
        // the decoder's reference chain intact; the small latency cost is a fine
        // trade for a stable picture in a VMS live view.
        lowLatencyMode: false,
        liveSyncDuration: 3,
        liveMaxLatencyDuration: 12,
        maxBufferLength: 15,
        backBufferLength: 10,
        // In the packaged app the WebView can't fetch the manifest/segments
        // directly (mixed content + self-signed TLS), so route them through
        // the Rust shim. In a plain browser, keep hls.js's default loader.
        ...(isTauri() ? { loader: TauriHlsLoader } : {}),
      });
      hls.loadSource(url);
      hls.attachMedia(el);
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        // The manifest declares the real codec (e.g. hvc1.1.6.L63.0 / avc1.*).
        onCodec?.(codecLabel(data.levels?.[0]?.videoCodec));
        el.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          onError(data.details ?? "HLS fatal error");
          hls?.destroy();
        }
      });
      el.addEventListener("playing", onPlaying, { once: true });
      // Confirm the native HLS stream actually paints (caller passes
      // onRenderVerified only while attempting the native codec). The readiness
      // probe already ensured the manifest is serving, so a black result here
      // means the WebView can't decode this codec -> caller falls back to H.264.
      if (onRenderVerified) {
        verifyCtrl = new AbortController();
        const ctrl = verifyCtrl;
        verifyVideoRenders(el, { signal: ctrl.signal }).then((ok) => {
          if (!ctrl.signal.aborted) onRenderVerified(ok);
        });
      }
    };

    // Probe the manifest first (Tauri only) so we mount hls.js on a stream
    // that's already serving — the server may need a moment to spin up the
    // on-demand H.264 transcode. The connecting overlay covers the wait; hls.js
    // never sees the transient 404. In a plain browser the probe would hit CORS
    // (it goes out as a real cross-origin fetch), so skip it and let hls.js load
    // directly.
    if (isTauri()) {
      waitForHlsReady(url, { signal: controller.signal })
        .then(() => start())
        .catch((e: unknown) => {
          if (!cancelled) onError(e instanceof Error ? e.message : "stream not ready");
        });
    } else {
      start();
    }

    return () => {
      cancelled = true;
      controller.abort();
      verifyCtrl?.abort();
      hls?.destroy();
      el.removeEventListener("playing", onPlaying);
    };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <video
      ref={videoRef}
      className="h-full w-full object-contain"
      muted={muted}
      playsInline
      autoPlay
      controls={controls}
    />
  );
}

