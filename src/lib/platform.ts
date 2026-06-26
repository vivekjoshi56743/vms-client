// Coarse OS detection from the WebView user-agent. Used to pick the live-video
// path: macOS (WKWebView) and Windows (WebView2) play the cameras' native
// streams fine via WHEP/HLS, but Linux (WebKitGTK) drops frames on their
// irregular timestamps — so on Linux we render the backend's MJPEG instead
// (see LiveMjpegView).
export function isLinux(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /linux/i.test(ua) && !/android/i.test(ua);
}
