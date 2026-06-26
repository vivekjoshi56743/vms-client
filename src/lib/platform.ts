// Coarse OS detection from the WebView user-agent. Used to pick the live-video
// path: macOS (WKWebView) and Windows (WebView2) tolerate our irregular-
// timestamp streams via native <video>/MSE, but Linux (WebKitGTK) drops frames,
// so on Linux we self-decode to a canvas instead (see LiveMjpegView).
export function isLinux(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /linux/i.test(ua) && !/android/i.test(ua);
}
