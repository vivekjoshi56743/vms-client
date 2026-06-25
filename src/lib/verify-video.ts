// Verify that a <video> is ACTUALLY rendering decoded frames — not just that
// it reported "no error".
//
// Why this exists: canPlayType() / MediaSource.isTypeSupported() are unreliable
// for HEVC on WebKit (WKWebView, WebKitGTK). They can answer "supported" and
// then produce a BLACK SCREEN with no `error` event when the GStreamer/codec
// backend can't actually decode the stream. So instead of trusting a capability
// probe, we watch for proof that a real frame was painted, and treat its
// absence (within a timeout) as failure.
//
// Signals, strongest first:
//   1. requestVideoFrameCallback — fires only when a decoded frame is sent to
//      the compositor. Definitive proof of decode. (Chromium + modern WebKit.)
//   2. Canvas pixel sample — if rVFC is unavailable, draw the frame and look for
//      any non–near-black pixel. (A failed decode yields no/blank frames.)
//   3. `error` event or timeout with nothing painted -> failure.
//
// Resolves true if the video genuinely renders, false if it stays blank.

interface VideoFrameCapable {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
}

export function verifyVideoRenders(
  el: HTMLVideoElement,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<boolean> {
  const timeoutMs = opts.timeoutMs ?? 6000;
  const vfc = el as HTMLVideoElement & VideoFrameCapable;
  const hasRVFC = typeof vfc.requestVideoFrameCallback === "function";

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let vfcId: number | undefined;
    let pollId: ReturnType<typeof setTimeout> | undefined;
    // The black-screen failure timer. Armed ONLY while the video is actively
    // playing — a paused / buffering / not-yet-started video legitimately paints
    // nothing, and counting that as a decode failure was the bug this guards
    // against (playback opens paused; every seek pauses). Re-armed on `playing`,
    // cleared on `pause`/`waiting`, so the timeout measures *playing* time spent
    // without a painted frame, not wall-clock since the URL was assigned.
    let failTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (rendered: boolean) => {
      if (settled) return;
      settled = true;
      if (failTimer) clearTimeout(failTimer);
      if (pollId) clearTimeout(pollId);
      if (vfcId != null && typeof vfc.cancelVideoFrameCallback === "function") {
        vfc.cancelVideoFrameCallback(vfcId);
      }
      el.removeEventListener("error", onError);
      el.removeEventListener("playing", armFailTimer);
      el.removeEventListener("pause", disarmFailTimer);
      el.removeEventListener("waiting", disarmFailTimer);
      opts.signal?.removeEventListener("abort", onAbort);
      resolve(rendered);
    };

    // 1) Definitive positive: a decoded frame reached the compositor.
    if (hasRVFC) {
      vfcId = vfc.requestVideoFrameCallback!(() => finish(true));
    } else {
      // 2) Fallback positive (no rVFC): sample pixels for real content.
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 18;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const sample = () => {
        if (settled) return;
        try {
          if (ctx && el.readyState >= 2 && el.videoWidth > 0) {
            ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
            const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
            for (let i = 0; i < data.length; i += 4) {
              // Any pixel above near-black => a real frame was decoded.
              if (data[i] > 16 || data[i + 1] > 16 || data[i + 2] > 16) {
                finish(true);
                return;
              }
            }
          }
        } catch {
          // drawImage can throw before the frame is ready — ignore and retry.
        }
        pollId = setTimeout(sample, 400);
      };
      sample();
    }

    // 3) Failure timer — only counts down while the video is genuinely playing.
    const armFailTimer = () => {
      if (settled || failTimer != null) return;
      failTimer = setTimeout(() => finish(false), timeoutMs);
    };
    const disarmFailTimer = () => {
      if (failTimer != null) {
        clearTimeout(failTimer);
        failTimer = undefined;
      }
    };
    el.addEventListener("playing", armFailTimer);
    el.addEventListener("pause", disarmFailTimer);
    el.addEventListener("waiting", disarmFailTimer);
    // Already playing when we attached (e.g. autoplaying live HLS)? Start now.
    if (!el.paused && !el.ended && el.readyState >= 2) armFailTimer();

    // 4) Errors: only a genuine DECODE / unsupported-format error proves this
    // codec can't render here. Transient NETWORK / ABORTED errors (a dropped
    // fetch, a reload, a Range hiccup) must NOT be misread as a codec failure —
    // ignore them and leave the verdict untested so we retry native next time
    // rather than permanently switching the camera to a server transcode.
    const onError = () => {
      const code = el.error?.code;
      if (
        code === MediaError.MEDIA_ERR_DECODE ||
        code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
      ) {
        finish(false);
      }
    };
    el.addEventListener("error", onError);

    // External cancel (component unmount / window change): stop, verdict unused.
    const onAbort = () => finish(false);
    opts.signal?.addEventListener("abort", onAbort, { once: true });
  });
}
