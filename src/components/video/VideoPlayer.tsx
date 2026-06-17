import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { connectWhep, type WhepSession } from "@/lib/whep";

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
}

// URL type detection — order matters (WHEP check before generic http).
type UrlKind = "whep" | "hls" | "native" | "unknown";

function detectKind(url: string): UrlKind {
  const lower = url.toLowerCase();
  if (lower.includes("/whep")) return "whep";
  if (lower.includes(".m3u8") || lower.includes("index.m3u8")) return "hls";
  if (lower.endsWith(".mp4") || lower.endsWith(".fmp4") || lower.includes("fmp4")) return "native";
  // Fallback: treat as HLS if it's an http(s) URL without a whep path
  if (lower.startsWith("http")) return "hls";
  return "unknown";
}

export function VideoPlayer({
  url,
  hlsFallback,
  className,
  onStateChange,
  muted = true,
  controls = false,
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
  const kind = detectKind(activeUrl);

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
          key={`whep-${activeUrl}-${retryKey}`}
          url={activeUrl}
          hlsFallback={hlsFallback ?? undefined}
          muted={muted}
          onPlaying={() => updateState("playing")}
          onConnecting={() => updateState("connecting")}
          onError={handleError}
        />
      )}
      {kind === "hls" && (
        <HlsPlayer
          key={`hls-${activeUrl}-${retryKey}`}
          url={activeUrl}
          muted={muted}
          controls={controls}
          onPlaying={() => updateState("playing")}
          onConnecting={() => updateState("connecting")}
          onError={handleError}
        />
      )}
      {(kind === "native" || kind === "unknown") && (
        <NativePlayer
          key={`native-${activeUrl}-${retryKey}`}
          url={activeUrl}
          muted={muted}
          controls={controls}
          onPlaying={() => updateState("playing")}
          onConnecting={() => updateState("connecting")}
          onError={handleError}
        />
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
}: {
  url: string;
  hlsFallback?: string;
  muted: boolean;
  onPlaying: () => void;
  onConnecting: () => void;
  onError: (msg: string, opts?: { whepUnsupportedCodec?: boolean; hlsFallback?: string }) => void;
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
      if (e.whepUnsupportedCodec && hlsFallback) {
        onError(err.message, { whepUnsupportedCodec: true, hlsFallback });
      } else {
        onError(err.message);
      }
    };

    connectWhep(
      url,
      (stream) => {
        if (cancelled) return;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {/* autoplay blocked */});
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
}: {
  url: string;
  muted: boolean;
  controls: boolean;
  onPlaying: () => void;
  onConnecting: () => void;
  onError: (msg: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    onConnecting();

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        // Minimise live latency: stay 1 segment behind live edge, skip forward
        // if we fall more than 4 s behind, cap the buffer to 4 s.
        liveSyncDuration: 1,
        liveMaxLatencyDuration: 4,
        maxBufferLength: 4,
        backBufferLength: 4,
      });
      hls.loadSource(url);
      hls.attachMedia(el);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        el.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          onError(data.details ?? "HLS fatal error");
          hls.destroy();
        }
      });
      el.addEventListener("playing", onPlaying, { once: true });
      return () => {
        hls.destroy();
        el.removeEventListener("playing", onPlaying);
      };
    }

    // Native HLS (Safari / WKWebView).
    if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = url;
      el.addEventListener("playing", onPlaying, { once: true });
      el.addEventListener("error", () => onError("Native HLS error"), { once: true });
      el.play().catch(() => {});
      return () => {
        el.removeEventListener("playing", onPlaying);
      };
    }

    onError("HLS not supported in this WebView");
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

// ─── Native sub-player ───────────────────────────────────────────────────────

function NativePlayer({
  url,
  muted,
  controls,
  onPlaying,
  onConnecting,
  onError,
}: {
  url: string;
  muted: boolean;
  controls: boolean;
  onPlaying: () => void;
  onConnecting: () => void;
  onError: (msg: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    onConnecting();
    el.addEventListener("playing", onPlaying, { once: true });
    el.addEventListener("error", () => onError("Video playback error"), { once: true });
    return () => {
      el.removeEventListener("playing", onPlaying);
    };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <video
      ref={videoRef}
      src={url}
      className="h-full w-full object-contain"
      muted={muted}
      playsInline
      autoPlay
      controls={controls}
    />
  );
}
