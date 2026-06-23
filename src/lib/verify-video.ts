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

    const finish = (rendered: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (pollId) clearTimeout(pollId);
      if (vfcId != null && typeof vfc.cancelVideoFrameCallback === "function") {
        vfc.cancelVideoFrameCallback(vfcId);
      }
      el.removeEventListener("error", onError);
      opts.signal?.removeEventListener("abort", onAbort);
      resolve(rendered);
    };

    // 1) Definitive positive: a decoded frame reached the compositor.
    if (hasRVFC) {
      vfcId = vfc.requestVideoFrameCallback!(() => finish(true));
    }

    // 2) Fallback positive (no rVFC): sample pixels for real content.
    if (!hasRVFC) {
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

    // 3) Hard failure.
    const onError = () => finish(false);
    el.addEventListener("error", onError, { once: true });

    // 4) Nothing painted in time => treat as a black-screen decode failure.
    const timer = setTimeout(() => finish(false), timeoutMs);

    // External cancel (component unmount / window change): stop, verdict unused.
    const onAbort = () => finish(false);
    opts.signal?.addEventListener("abort", onAbort, { once: true });
  });
}
