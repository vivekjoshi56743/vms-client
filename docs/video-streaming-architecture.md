# Video Streaming Architecture — How Live & Playback Work Now

> **Current as of commit:** `250573e` — bump this (and this doc) in the same
> commit whenever the video codec/transcode/routing behavior changes (CLAUDE.md
> Rule 9).
>
> The "what's actually going on" reference for video in the Supervision client.
> Read this to understand how we pick codecs, when we transcode, the `hev1→hvc1`
> tag rename, and where each piece lives. Companion to
> [webview-video-problem.md](./webview-video-problem.md), which explains *why*
> it's built this way (the WebKitGTK / mixed-content / HEVC saga).

---

## 1. The one-paragraph mental model

Cameras stream **HEVC (H.265)** by default; some are **H.264**. The browser
engine that has to *display* the video — the OS WebView — differs per platform
and may or may not be able to decode HEVC. So the rule everywhere is:

> **Use the camera's native stream. Confirm a real frame actually paints. Only
> if it stays black, ask the backend to transcode that one stream to H.264.**

We never trust a capability *probe* (`canPlayType` / `isTypeSupported`) — on
WebKit they lie ("supported" → black screen, no error). We **observe** an actual
decoded frame instead. Decisions are made **per camera**, so a natively-H.264
camera always plays directly even if some HEVC camera on the same device failed.

---

## 2. The platform landscape (why this is hard)

Tauri uses the OS-native WebView, and they are not equal:

| OS | WebView | WebRTC | MSE (for HLS) | HEVC decode |
|---|---|---|---|---|
| Windows | WebView2 (Chromium) | ✅ | ✅ | only if the OS "HEVC Video Extensions" are installed |
| macOS | WKWebView (Safari) | ✅ | ✅ | ✅ native |
| Linux | WebKitGTK | depends on GStreamer | depends on GStreamer | depends on GStreamer (`gst-libav`) |

On Linux the WebView is a shell over **GStreamer**; if the plugins aren't there,
WebRTC / MSE / HEVC simply don't exist. We fix that by **bundling GStreamer into
the Linux AppImage** (`bundle.linux.appimage.bundleMediaFramework = true` +
installing `gstreamer1.0-plugins-{base,good,bad,ugly}` + `gstreamer1.0-libav` on
the CI builder). The AppImage then carries its own media stack and behaves like
Windows/macOS regardless of the host distro. The `.deb`/`.rpm` don't embed it —
they declare those packages as dependencies instead
(`bundle.linux.deb.depends`).

### Linux: demote broken NVIDIA hardware decoders

The `.deb` runs against the **system** GStreamer registry, not a bundled one — so
it can see decoders the AppImage never does. On machines with NVIDIA's GStreamer
plugins, `nvv4l2decoder` (and the `nvcodec` siblings `nvh265dec`/`nvh264dec`)
register at a **higher rank** than the software `avdec_h265`/`avdec_h264`, so
GStreamer auto-plugs them first. Inside WebKitGTK's MSE pipeline they **advertise**
H.265/H.264 support but then **fail caps negotiation** (`not-negotiated` →
`Failed to push buffer (code=5)`) → live video never decodes. This is why live
worked in the AppImage (bundled software-only plugins) but black-screened in the
`.deb` on the same machine.

Fix: `run()` in **`src-tauri/src/lib.rs`** sets
`GST_PLUGIN_FEATURE_RANK=nvv4l2decoder:0,nvh265dec:0,nvh264dec:0,…` on Linux
(unless already set), before the WebView starts, so GStreamer falls back to the
reliable software `avdec_*`. Child WebKit processes inherit it.

### Live HLS buffer (software-decode stability)

The hls.js live config in **`src/components/video/VideoPlayer.tsx`** keeps a few
seconds of buffer (`liveSyncDuration: 3`, `maxBufferLength: 15`,
`lowLatencyMode: false`) rather than an ultra-low-latency window. A too-tight
window makes hls.js skip forward and drop frames; on a **software** decoder a
dropped *reference* frame breaks the HEVC reference chain → **green frames +
stutter** until the next keyframe. The small added latency buys a stable picture.

---

## 3. Everything talks to the backend through Rust

The backend uses a **self-signed TLS cert**, and the packaged WebView serves
from a **secure origin** that blocks plain-HTTP (mixed content). So the WebView
**cannot** reach the backend directly. All traffic is routed through Rust, which
pins the cert (TOFU) and isn't subject to WebView mixed-content rules:

- REST + WHEP signaling + HLS manifest/segments → `tofu_http_request` (via the
  `tauriFetch` shim and a custom hls.js loader).
- Playback video → the `playback_window` IPC command.

So "fetch the stream" always means "ask Rust to fetch it."

---

## 4. The codec decision — native-first, observe, fall back

This is the heart of it, and **live and playback now work the same way**, each
with its own per-camera verdict store (they must be separate — a WebView can
support HEVC via a plain `<video>` but not via MSE, or vice-versa):

```
For each camera:
  verdict = undefined (untested) | "native" | "h264"

  1. Request the NATIVE stream (no vcodec param).
       → backend returns whatever the camera is (HEVC or already H.264). No transcode.
  2. Play it, then VERIFY a real frame painted (verifyVideoRenders).
  3. Renders  → mark "native"  → keep using native forever. NO TRANSCODE.
     Black     → mark "h264"    → re-request this camera with ?vcodec=h264
                                   (backend transcodes) and reload.
```

**Why "observe" not "probe":** `verifyVideoRenders` (`src/lib/verify-video.ts`)
watches for proof of an actual decoded frame:

1. `requestVideoFrameCallback` — fires only when a decoded frame hits the
   compositor. Definitive.
2. If that API is absent, sample the `<canvas>` for any non-black pixel.
3. Failure = **no frame painted within ~6 s of *playing* time**, or a genuine
   `MEDIA_ERR_DECODE` / `MEDIA_ERR_SRC_NOT_SUPPORTED` error (the
   black-screen-with-no-error case).

Two guards keep this from firing a **false** "needs H.264":

- **Only judged while playing.** The ~6 s timer is armed on the `playing` event
  and cleared on `pause`/`waiting`, so it measures *playing time without a painted
  frame* — not wall-clock since the URL was assigned. A paused or buffering
  `<video>` paints nothing; timing it out would wrongly demand a transcode.
  Playback opens **paused** and every seek pauses, so the playback probe
  (`PlaybackTile`) additionally waits for `isPlaying` before it even starts.
- **Transient errors are ignored.** Only `MEDIA_ERR_DECODE` /
  `MEDIA_ERR_SRC_NOT_SUPPORTED` count as a codec failure. A dropped fetch, a
  reload, or a Range hiccup (`MEDIA_ERR_NETWORK` / `MEDIA_ERR_ABORTED`) leaves the
  verdict **untested**, so we retry native next time rather than permanently
  switching the camera to a server transcode.

Capable devices confirm in well under a second; only a device that genuinely
can't decode a *playing* stream eats the ~6 s before falling back (once, per
camera, per session).

---

## 5. The `hev1 → hvc1` retag (the "4-byte change")

HEVC inside MP4 is labelled by a 4-character tag — `hev1` or `hvc1`. Same video,
two conventions. **WebKit only accepts `hvc1`.** So when we serve HEVC, Rust
scans the first 64 KB of the muxed file and renames `hev1` → `hvc1`. It is **not
transcoding** — just a 4-letter rename so the WebView accepts the stream.

- Lives in **`src-tauri/src/lib.rs` `playback_window`** (the playback path).
- Runs **whenever we serve HEVC** (gated on `vcodec != "h264"`), on every
  platform — not macOS-only anymore, since Linux/Windows can now receive native
  HEVC too. No-op for H.264 (no `hev1` box exists).
- Live does **not** use it (live HLS/WHEP comes straight from MediaMTX).

---

## 6. LIVE flow (current)

**Selection** is per camera, observed (no probe):

- `useStream`/`useStreams` request each camera's stream with the vcodec from its
  **live verdict** (`stores/liveCodec.ts`). Default = native; `h264` only after
  the native stream was observed not to render.
- Transport: prefer **WHEP** (WebRTC) when `RTCPeerConnection` exists and we
  haven't learned WHEP can't carry this camera's codec; otherwise **HLS**
  (hls.js, needs MSE), readiness-probed before mounting.
- `VideoTile` wires the player's verification callbacks to the live verdict.
- WHEP can't carry HEVC, so an HEVC camera's WHEP attempt fails with "unsupported
  codec" → we remember it (`whepUnsupported`, skip WHEP next time) and fall to
  native HLS.

| Platform | Native attempt | Result |
|---|---|---|
| macOS | HEVC | WHEP rejects HEVC → native HLS-HEVC renders → **native, no transcode** (WHEP skipped after 1st time) |
| Windows + HEVC | HEVC | WHEP/HLS, native HEVC renders → **no transcode** |
| Linux + GStreamer | HEVC | native HLS-HEVC renders → **no transcode** (confirmed) |
| Win without HEVC / stripped Linux | HEVC | native stays black → **that camera → H.264** |
| Any platform, H.264 camera | H.264 | plays via WHEP (low latency) → **never transcodes** |

When a camera flips to `h264`, its query key changes, so `useStreams` refetches
the H.264 URLs (`hls_h264` / `webrtc_h264`) and the tile re-renders onto them —
H.264 even works over WHEP, so those cameras regain low latency.

---

## 7. PLAYBACK flow (current)

A different render path — Rust muxes a finite MP4 window and the page plays it
from a `blob:` URL in a plain `<video>` (needs **neither** WebRTC nor MSE):

- `PlaybackTile` requests the native window via `fetchPlaybackWindow` →
  `playback_window` IPC. Codec is **client-driven** (Rust no longer guesses by
  OS): native unless the per-camera **playback verdict** (`stores/playbackCodec.ts`)
  says `h264`.
- Rust applies the `hev1→hvc1` retag for HEVC, returns bytes → blob → `<video>`.
- `verifyVideoRenders` checks a real frame painted. Black → mark `h264` → drop
  the wrong-codec blobs and reload that camera's windows as H.264.

| Platform | Native window | Result |
|---|---|---|
| macOS / Linux+GStreamer / Win+HEVC | HEVC (retagged) | **native HEVC, no transcode** |
| Win without HEVC / stripped Linux | HEVC | native stays black → **that camera → H.264** |
| Any platform, H.264 camera | H.264 | plays directly → **never transcodes** |

This is what removed the `playback 503: too many concurrent transcode sessions`
errors — capable devices stopped asking the backend to transcode at all.

---

## 8. Live vs Playback at a glance

| | LIVE | PLAYBACK |
|---|---|---|
| Codec chosen by | observe real render, **per camera** | observe real render, **per camera** |
| Verdict store | `stores/liveCodec.ts` (MSE/WHEP path) | `stores/playbackCodec.ts` (`<video>` path) |
| Player | WHEP (WebRTC) → HLS (hls.js / MSE) | `<video>` + `blob:` (no MSE/WebRTC) |
| Transcode trigger | native stream stays black for that camera | native stream stays black for that camera |
| `hev1→hvc1` retag | not used | yes, whenever serving HEVC |
| Routing | through Rust (TOFU) | through Rust (`playback_window`) |

On a capable machine (macOS, Linux+GStreamer, HEVC-Windows) **both live and
playback use the camera's native codec with zero transcoding.** The backend only
transcodes the specific streams a given device genuinely can't render.

**Codec badge:** each tile shows the codec actually being played next to the
camera name (`{name} / H.265`). Source per path: live-HLS reads it from the
manifest (`level.videoCodec`), live-WHEP is always `H.264` (WebRTC can't carry
HEVC here), playback scans the muxed MP4's sample-entry fourcc
(`lib/codec-label.ts`).

---

## 9. Where it lives in code

| Concern | File |
|---|---|
| Render verification (the trust signal) | `src/lib/verify-video.ts` |
| Codec → display label (badge) | `src/lib/codec-label.ts` |
| Live per-camera verdict + WHEP-unsupported memory | `src/stores/liveCodec.ts` |
| Playback per-camera verdict | `src/stores/playbackCodec.ts` |
| Live stream request (per-camera vcodec) | `src/hooks/useStream.ts` |
| Stream URL types + `selectLiveUrls` + `ensureStream(vcodec)` | `src/api/streams.ts` |
| Live player + WHEP/HLS + verification wiring | `src/components/video/VideoPlayer.tsx` |
| Live tile (wires verdict ↔ player) | `src/components/video/VideoTile.tsx` |
| Playback tile (request → verify → fallback) | `src/components/playback/PlaybackTile.tsx` |
| Playback fetch | `src/api/playback.ts` |
| Playback mux + `vcodec` + `hev1→hvc1` retag (Rust) | `src-tauri/src/lib.rs` (`playback_window`) |
| HLS-through-Rust loader + readiness probe | `src/lib/hls-tauri-loader.ts`, `src/lib/hls-ready.ts` |
| WHEP signaling through Rust | `src/lib/whep.ts` |
| Linux GStreamer bundling | `src-tauri/tauri.conf.json`, `.github/workflows/build.yml` |

---

## 10. Backend contract we rely on

`POST /api/cameras/{id}/stream?vcodec=h264` (live) and
`/api/_playback/get?...&vcodec=h264` (playback) return a **guaranteed-H.264**
variant, transcoded server-side and shared across viewers. Without `vcodec` the
backend returns the camera's **native** codec (no transcode). Already-H.264
cameras incur no transcode either way. We request `vcodec=h264` only for the
streams a given device has been observed unable to render.
