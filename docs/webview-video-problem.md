# Supervision Client — WebView Video Playback Problem (Technical Brief)

> Self-contained handoff document. Assumes no prior context. Goal: get another
> engineer/AI fully up to speed on why live (and now playback) video fails on
> Linux, and what the design options are.
>
> **Status:** this is the *problem/analysis* record. For how it's actually built
> now (native-first, observe-and-verify per camera, the `hev1→hvc1` retag, the
> Linux GStreamer bundle), see
> [video-streaming-architecture.md](./video-streaming-architecture.md).

## 1. What the system is

**Supervision** is a self-hosted video management system (VMS) for IP cameras.

- **Backend**: a Go service wrapping **MediaMTX** (open-source streaming server).
  Ingests cameras over RTSP, records them, and re-publishes live in multiple
  protocols (WHEP/WebRTC, HLS, RTSP, RTMP, SRT). Serves recorded playback. Auth
  is a bearer token (`POST /api/auth/login`). Uses a **self-signed TLS cert**.
  MediaMTX ports observed: WHEP `:8889`, HLS `:8888`, RTSP `:8554`, RTMP `:1935`,
  SRT `:8890`. API on `:8443`.
- **Cameras**: Hikvision IP cameras over RTSP. **Video codec is HEVC (H.265)** —
  confirmed from the HLS manifest: `CODECS="hvc1.1.6.L63.0"`, 640×360, 25fps.
- **Client**: a **Tauri 2.0** desktop app (this brief's subject). Frontend is
  **React 18 + TypeScript**; native shell is **Rust**. Ships for **Windows,
  macOS, Linux**.

## 2. What Tauri is, and what a "WebView" is

**Tauri** builds desktop apps where the UI is a web app rendered inside the OS's
**native WebView**, with a **Rust** backend for native capability. Like Electron,
but it reuses the OS WebView instead of bundling Chromium → ~10MB installer.

The catch — and the source of nearly every problem here — is that Tauri uses a
**different WebView per OS**, and they are **not** equivalent:

| OS | WebView | Engine | Notes |
|---|---|---|---|
| Windows | **WebView2** | Chromium (Edge) | Most capable; behaves like Chrome. |
| macOS | **WKWebView** | WebKit (Safari) | Capable; decodes HEVC natively. |
| Linux | **WebKitGTK** | WebKit + GTK | **Weakest and most variable.** WebRTC, MSE, and even codec decode are **optional build flags** and may be **absent** depending on the distro package. |

A feature guaranteed on Windows/macOS (WebRTC, Media Source Extensions) **may
simply not exist** in the Linux WebView. This is the root of everything.

Rust↔JS communicate via **IPC commands** (`invoke`) and Rust can register
**custom URI schemes** (e.g. `proxy://`). In a **packaged** Tauri app the frontend
is served from a **secure custom origin** (`tauri://localhost` etc.) — this
matters (see §4).

## 3. TOFU/trust — why ALL networking goes through Rust

The backend's TLS cert is **self-signed**, so a WebView would reject it. The
client implements **TOFU (Trust On First Use)** in Rust:

- First connection: Rust captures the cert's **SHA-256 fingerprint**, shows a
  trust dialog, persists the decision to `tofu-trust.json` keyed by `host:port`.
- A **custom rustls verifier** then pins that fingerprint on every request.

Architectural consequence (key fact): **the WebView itself cannot talk to the
backend** — the cert isn't WebView-trusted, and mixed-content rules block it
(§4). So **every HTTP request is routed through Rust**:

- A JS `fetch` shim (`tauriFetch`) forwards to a Rust command (`tofu_http_request`)
  using a `reqwest` client wired to the pinning verifier; bytes return to JS.
- Playback video streams through a custom `proxy://` scheme + an IPC command
  (`playback_window`) that fetches a fully-muxed MP4, caches it, and hands it to
  `<video>` as a **`blob:` URL**.

**Rule of thumb: nothing reaches the backend directly from the WebView; it all
goes through the Rust pinned-TLS client.**

## 4. The packaged-app "secure origin" problem (mixed content)

- `tauri dev` → frontend served from `http://localhost:1420` (insecure origin) →
  plain-HTTP requests allowed.
- **Packaged app** → served from `tauri://localhost` (**secure** origin) → plain
  `http://` requests are **mixed content** and the WebView **silently blocks**
  them. WebKit reports this generically as **"Load failed."**

This is why things "work in dev but break in the build": MediaMTX serves WHEP/HLS
over plain HTTP, and from the packaged secure origin those direct fetches are
blocked. **Fix applied:** route them through the Rust shim (Rust isn't subject to
WebView mixed-content rules).

## 5. How live video is supposed to work

`POST /api/cameras/{id}/stream` returns WHEP, HLS, RTSP, etc. The player tries:

1. **WHEP (WebRTC)** — lowest latency. Uses browser `RTCPeerConnection`; only SDP
   signaling is an HTTP POST (via Rust), media flows over UDP.
2. **HLS** — fallback. Uses **hls.js**, which **requires MSE** (Media Source
   Extensions) in the WebView.
3. **Playback** (separate) — progressive MP4 via `<video>` + blob; needs
   **neither** WebRTC nor MSE, only the WebView's basic `<video>` decode.

## 6. The H.264 transcode contract (added to fix HEVC)

Because cameras are HEVC and not every WebView decodes HEVC, the backend exposes
an opt-in H.264 variant:

- `POST /api/cameras/{id}/stream?vcodec=h264` → backend starts a **shared
  server-side ffmpeg transcode** (HEVC→H.264, audio→AAC) publishing to a
  `cam-{id}-h264` MediaMTX path, served as HLS (`hls_h264`) and WHEP
  (`webrtc_h264`). One transcode is shared across all viewers of that camera.
- Lifecycle: idempotent start, idle reaper tears it down ~60s after the last
  viewer. Already-H.264 cameras skip transcoding.
- **Documented error codes**: 404 (camera not found), **501** (ffmpeg missing),
  **503 + Retry-After** (concurrent-transcode cap reached), 502 (MediaMTX reg).
- Client requests this **only when it can't decode HEVC** (capability probe via
  `MediaSource.isTypeSupported` + `<video>.canPlayType`).
- Playback path already does the analogous thing in Rust: it appends
  `vcodec=h264` to `/api/_playback/get` on **non-macOS** (macOS keeps HEVC
  passthrough), then plays the muxed MP4 from a blob.

## 7. The chain of problems hit (in order)

1. **Packaged app: "WHEP signaling failed: Load failed" & hls.js
   `MANIFESTLOADERROR`.** Cause: mixed content (§4). **Fixed:** WHEP signaling
   through `tauriFetch`; a **custom hls.js loader** fetches manifest+segments
   through Rust.
2. **Linux: "Can't find variable: RTCPeerConnection".** Cause: **WebKitGTK has no
   WebRTC** (build flag off). **Fixed:** detect missing `RTCPeerConnection`, skip
   WHEP → use HLS.
3. **HEVC codec.** Cameras stream H.265; Linux WebKitGTK (and stock Windows
   without the HEVC extension) can't decode it; WebRTC generally can't carry HEVC.
   **Fix:** the §6 H.264 transcode contract; client requests H.264 when it can't
   decode HEVC.
4. **Linux: "HLS NOT SUPPORTED IN THIS WEBVIEW".** Cause: `Hls.isSupported()`
   returns **false** — this WebKitGTK build has **no MSE**. hls.js cannot run
   **regardless of codec**, so even the H.264 HLS can't play. This WebView lacks
   **both WebRTC and MSE** — a stripped media build.
5. **503 transcode-cap exhaustion (NEW — see §8).**

## 8. Latest observed state on Linux (Arch) — BOTH live and playback fail

Two distinct failures now occur together:

**(A) Live grid (3×3, 9 cameras):**
- One tile: **"HLS NOT SUPPORTED IN THIS WEBVIEW"** (it got URLs, but no MSE).
- Several tiles: **"NO SOURCE"** — these cameras returned **no stream URLs at
  all**, because their `?vcodec=h264` request got a **503**.

**(B) Playback:**
- `playback 503: {"error":"server busy: too many concurrent transcode sessions"}`

**Root cause of the 503s — the H.264 fallback does not scale on a grid.** Because
Arch can't decode HEVC, **every** live tile requests `?vcodec=h264`. A 9-camera
grid = up to **9 simultaneous server-side transcodes**, plus playback's transcode.
This exhausts the backend's **concurrent-transcode cap**, so:
- live tiles past the cap get 503 → "NO SOURCE";
- playback gets 503 → the error shown.

This is a **shared backend resource** — the transcode/mux pool likely also covers
the playback muxer, so a saturated pool can break playback for **other clients
too** (incl. macOS, even though macOS playback itself uses HEVC passthrough).

**Two compounding problems, to be clear:**
- **Rendering**: even a *returned* stream can't play on Arch (no MSE/WebRTC) — a
  WebView-capability problem (§9).
- **Capacity**: requesting one transcode per live tile (×9) + playback exhausts
  the backend's transcode cap — a scaling problem the fallback strategy created.

**Diagnostic still blocked:** we wanted to know whether `<video>` + H.264 MP4
*renders* on this Arch WebView (the Playback path). But Playback now fails at the
**server (503)**, before any bytes reach the renderer — so the render question is
still unanswered. To test it we'd need one playback to succeed (raise the cap or
reduce concurrent transcodes).

## 9. The crux: display always depends on the WebView's media pipeline

Every WebView-native playback method depends on WebView capabilities:
- **WHEP** needs WebRTC. **HLS (hls.js)** needs MSE. **`<video src>`** needs the
  WebView's `<video>` + codec decoders (Linux: GStreamer plugins like
  `gst-libav`). **WebCodecs** needs the WebCodecs API.

There is **no codec-based path** that is WebView-independent. We can fix the
*source codec* (transcode to H.264), but the **WebView still must decode and
display** it. On a WebKitGTK build missing MSE/WebRTC/decoders, no codec or
protocol choice helps — the missing pieces are *inside the WebView*.

The only WebView primitives needing **zero** codec/media support (present in
every WebView, including the stripped one):
- **`<canvas>`** — paints raw pixels.
- **`<img>`** — decodes images (JPEG/PNG); image decode is core, not a video codec.

## 10. The open design question — be independent of the WebView's media stack

Decode the video **ourselves** and hand the WebView only pixels/images rendered to
`<canvas>`/`<img>`. Options and tradeoffs:

| Approach | Decode runs in | Crosses into WebView | WebView needs | Bandwidth | CPU / scaling |
|---|---|---|---|---|---|
| **Rust (bundled ffmpeg/GStreamer) → raw frames → canvas** | Native Rust (HW-accel possible) | Raw pixels (~20 MB/s/cam) | `<canvas>` | Huge | Decode + giant IPC; doesn't scale |
| **Rust → MJPEG → `<img>`/canvas** | Native Rust | JPEG frames (~1–2 MB/s/cam) | `<img>` (universal image decode) | Moderate | Decode + JPEG encode; OK at reduced fps |
| **WASM decoder (Broadway/ffmpeg.wasm) → canvas** | WebView JS engine | Encoded H.264 (small) | `<canvas>` + WASM | Low | Software decode, **no HW accel**, CPU-heavy |
| ~~WebCodecs → canvas~~ | WebView | — | WebCodecs API | — | ❌ still WebView-dependent (Linux likely lacks it) |

Cost of WebView-independence: lose hardware-accelerated `<video>`; CPU and/or
bandwidth rise; **does not scale well to a multi-camera grid** (app supports up to
5×5); app size grows (~50MB bundled native ffmpeg; few MB for ffmpeg.wasm; tiny
for Broadway but Baseline-profile only).

**Leading recommendation:** a **hybrid** — native `<video>`/WHEP/HLS where the
WebView supports it (Windows/macOS: efficient, HW-accelerated, scales), and a
**self-decode → canvas/MJPEG** fallback only on stripped WebViews / when native
playback fails. **But** this must be reconciled with §8: a self-decode fallback
that still relies on server transcodes will hit the same cap; client-side decode
(WASM or Rust+ffmpeg) avoids server transcodes entirely but moves the cost onto
the client.

## 11. Open questions for the reader

1. Most robust, lowest-complexity **WebView-independent** live path for a stripped
   WebKitGTK (no MSE, no WebRTC)? MJPEG-to-`<img>`/canvas (Rust-decoded) vs WASM
   decode (no native binary)?
2. How to **scale across a 5×5 grid** when self-decoding is CPU-bound — and how to
   avoid the **server concurrent-transcode cap** (§8) the current H.264 fallback
   trips?
3. Is fixing the Linux **environment** (require/ship GStreamer plugins:
   `gst-plugins-good/bad/ugly`, `gst-libav`, and an MSE-enabled WebKitGTK) more
   pragmatic than building a self-decode renderer?
4. Should the H.264 transcode be **gated/limited** (e.g. only the focused/1×1
   tile, or a per-client transcode budget) so a grid doesn't exhaust the backend?
5. What does the backend's concurrent-transcode cap count, and does it (wrongly)
   include playback mux sessions — explaining cross-client 503s?
