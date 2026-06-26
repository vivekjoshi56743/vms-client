mod events;
mod live_mjpeg;
mod secure_store;
mod tofu;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tauri::Manager;

/// In-memory LRU of fully-muxed playback windows, keyed by path|start|duration.
///
/// WebKit issues many small Range probes against a media resource, and the
/// backend's `/api/_playback/get` muxer is expensive and non-range — so we
/// fetch each window ONCE, cache the (retagged) bytes, and serve every range
/// from memory. Without this, each probe would regenerate the whole ~4 MB
/// window (the regeneration storm we saw).
#[derive(Default)]
struct PlaybackCache {
    inner: Mutex<PlaybackCacheInner>,
}

#[derive(Default)]
struct PlaybackCacheInner {
    map: HashMap<String, Arc<Vec<u8>>>,
    order: Vec<String>, // oldest first
}

const PB_CACHE_MAX: usize = 8;

impl PlaybackCache {
    fn get(&self, key: &str) -> Option<Arc<Vec<u8>>> {
        self.inner.lock().unwrap().map.get(key).cloned()
    }
    fn put(&self, key: String, bytes: Arc<Vec<u8>>) {
        let mut g = self.inner.lock().unwrap();
        if g.map.contains_key(&key) {
            return;
        }
        g.map.insert(key.clone(), bytes);
        g.order.push(key);
        while g.order.len() > PB_CACHE_MAX {
            let oldest = g.order.remove(0);
            g.map.remove(&oldest);
        }
    }
}

fn err_resp(status: u16, msg: String) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(status)
        .body(msg.into_bytes())
        .unwrap()
}

/// Fetch a fully-muxed playback window and return its raw bytes over the IPC.
///
/// This is the playback path used by the UI. We deliberately do NOT serve video
/// through the custom `proxy://` URI scheme for `<video>` playback: WebView2
/// (Windows) and WebKitGTK (Linux) handle custom-scheme media + Range requests
/// very differently from WKWebView, which produced `MEDIA_ELEMENT_ERROR:
/// Format error`. Instead the UI fetches each window through this command (the
/// same IPC the rest of the app already uses everywhere) and plays it from an
/// in-memory blob: URL — a plain MP4 the native media pipeline handles on every
/// platform, with no custom scheme, Range, or streaming involved.
///
/// Codec is CLIENT-DRIVEN, not guessed from the OS: the frontend requests native
/// HEVC (cheap passthrough) and only passes `vcodec = Some("h264")` after it has
/// *observed* that this WebView can't actually render HEVC (verifyVideoRenders).
/// This avoids needless server transcodes (and the concurrent-transcode cap) on
/// any device that can decode HEVC — Linux with GStreamer, HEVC-capable Windows,
/// macOS. When serving HEVC we retag hev1→hvc1 (WKWebView, and some WebKitGTK,
/// require it). Windows are cached (LRU) so re-seeks don't re-mux.
#[tauri::command]
async fn playback_window(
    app: tauri::AppHandle,
    host: String,
    token: String,
    path: String,
    start: String,
    duration: String,
    vcodec: Option<String>,
) -> Result<tauri::ipc::Response, String> {
    let host = host.trim_end_matches('/');
    let want_h264 = vcodec.as_deref() == Some("h264");
    // Codec is part of the cache key so HEVC and H.264 windows never collide.
    let key = format!("{path}|{start}|{duration}|{}", if want_h264 { "h264" } else { "hevc" });

    if let Some(c) = app.state::<PlaybackCache>().get(&key) {
        return Ok(tauri::ipc::Response::new(c.as_ref().clone()));
    }

    let url = {
        let mut ser = url::form_urlencoded::Serializer::new(String::new());
        ser.append_pair("format", "fmp4")
            .append_pair("duration", &duration)
            .append_pair("path", &path)
            .append_pair("start", &start);
        if want_h264 {
            ser.append_pair("vcodec", "h264");
        }
        format!("{host}/api/_playback/get?{}", ser.finish())
    };

    let t0 = std::time::Instant::now();
    eprintln!("[playback] MISS path={path} start={start} dur={duration}");

    let resp = app
        .state::<tofu::TofuState>()
        .http
        .get(&url)
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    if !resp.status().is_success() {
        let st = resp.status().as_u16();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("playback {st}: {}", &body[..body.len().min(200)]));
    }

    let mut v = resp
        .bytes()
        .await
        .map_err(|e| format!("read failed: {e}"))?
        .to_vec();

    // Serving native HEVC: WKWebView (and some WebKitGTK) require the 'hvc1'
    // sample-entry tag, not 'hev1'. Retag in the moov. (No-op for the H.264
    // path, which has no hev1 box, so it's gated on the HEVC case for clarity.)
    if !want_h264 {
        let scan = v.len().min(0x10000);
        let mut i = 0;
        while i + 4 <= scan {
            if &v[i..i + 4] == b"hev1" {
                v[i..i + 4].copy_from_slice(b"hvc1");
            }
            i += 1;
        }
    }

    eprintln!("[playback]   muxed bytes={} elapsed={:?}", v.len(), t0.elapsed());
    let arc = Arc::new(v);
    app.state::<PlaybackCache>().put(key, arc.clone());
    Ok(tauri::ipc::Response::new(arc.as_ref().clone()))
}

/// Max bytes pulled from the backend (and held in memory) per proxy request.
/// WebKit re-requests the next window as it plays/seeks, so a moderate chunk
/// keeps first-frame and scrub latency low without buffering a whole 400 MB
/// segment.
const CHUNK_SIZE: u64 = 4 * 1024 * 1024;

/// Parse a single HTTP byte-range header value like `bytes=0-` or
/// `bytes=1024-2047`. Returns (start, optional inclusive end). Suffix ranges
/// (`bytes=-500`) and multi-ranges aren't used by WebKit media loads, so an
/// unparseable value falls back to "from byte 0".
fn parse_range(value: &str) -> Option<(u64, Option<u64>)> {
    let spec = value.trim().strip_prefix("bytes=")?;
    let first = spec.split(',').next()?;
    let (s, e) = first.split_once('-')?;
    let start: u64 = s.trim().parse().ok()?;
    let end = match e.trim() {
        "" => None,
        v => Some(v.parse::<u64>().ok()?),
    };
    Some((start, end))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // On Linux the WebView is WebKitGTK over the *system* GStreamer registry.
    // If that registry includes a broken NVIDIA hardware decoder (`nvv4l2decoder`
    // and the nvcodec siblings), GStreamer auto-plugs it for H.265/H.264 because
    // NVIDIA registers it at a higher rank than the software `avdec_*` — but it
    // then fails caps negotiation inside WebKitGTK's MSE pipeline
    // ("not-negotiated" / "Failed to push buffer"), so live video never decodes.
    // Demote those elements to rank 0 so GStreamer falls back to the reliable
    // software decoders. The bundled-GStreamer AppImage never sees these elements,
    // which is exactly why it worked while the .deb didn't. Set before the WebView
    // (and its GStreamer) start; child WebKit processes inherit this env. A user
    // who needs their own ranking can still override via the environment.
    #[cfg(target_os = "linux")]
    if std::env::var_os("GST_PLUGIN_FEATURE_RANK").is_none() {
        std::env::set_var(
            "GST_PLUGIN_FEATURE_RANK",
            "nvv4l2decoder:0,nvh265dec:0,nvh264dec:0,nvh265sldec:0,nvh264sldec:0",
        );
    }

    // rustls 0.23 requires installing a crypto provider exactly once per
    // process before any TLS config is built.
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("failed to install rustls crypto provider");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Linux tolerant-live PoC: serve the latest self-decoded JPEG for a
        // camera. The frontend canvas pulls `liveframe://localhost/{cameraId}`
        // in a rAF loop (see LiveMjpegView.tsx + live_mjpeg.rs). Synchronous —
        // the frame is already in memory, no I/O.
        .register_asynchronous_uri_scheme_protocol("liveframe", |ctx, request, responder| {
            let app = ctx.app_handle();
            let camera_id = request.uri().path().trim_start_matches('/').to_string();
            let resp = match app.state::<live_mjpeg::LiveMjpegState>().frame_for(&camera_id) {
                Some(jpeg) => tauri::http::Response::builder()
                    .status(200)
                    .header("Content-Type", "image/jpeg")
                    .header("Cache-Control", "no-store")
                    .body(jpeg)
                    .unwrap(),
                None => err_resp(503, "no frame yet".to_string()),
            };
            responder.respond(resp);
        })
        .register_asynchronous_uri_scheme_protocol("proxy", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                let segment_id = request.uri().path().trim_start_matches('/');
                let query = request.uri().query().unwrap_or("");

                // The proxy URL carries both the bearer token and the active
                // backend origin in its query string — see `fetchPlaybackDataUrl`
                // in src/api/playback.ts. We need the host because the app
                // can talk to any backend the user pointed it at, not just
                // localhost:8443.
                let mut token = String::new();
                let mut host = String::new();
                // Playback-window mode params (see `buildPlaybackWindowUrl`):
                let mut pb_path = String::new();
                let mut pb_start = String::new();
                let mut pb_duration = String::new();
                for (k, v) in url::form_urlencoded::parse(query.as_bytes()) {
                    match k.as_ref() {
                        "token" => token = v.into_owned(),
                        "host" => host = v.into_owned(),
                        "path" => pb_path = v.into_owned(),
                        "start" => pb_start = v.into_owned(),
                        "duration" => pb_duration = v.into_owned(),
                        _ => {}
                    }
                }

                if token.is_empty() || host.is_empty() {
                    responder.respond(
                        tauri::http::Response::builder()
                            .status(401)
                            .header("content-type", "text/plain")
                            .body("Missing token or host".as_bytes().to_vec())
                            .unwrap(),
                    );
                    return;
                }

                let state = app.state::<tofu::TofuState>();

                // Strip trailing slash before concatenating the path.
                let host = host.trim_end_matches('/');

                // Two modes:
                //  • playback window (path == "playback"): ask the backend to mux
                //    a fresh fMP4 that *starts at an arbitrary timestamp* via
                //    /api/_playback/get. This is how we seek — the stored
                //    recordings are 1-hour fragmented MP4s with no `sidx`, so a
                //    native byte-seek is impossible; instead we request a stream
                //    that begins exactly where we want and play it from 0. That
                //    endpoint is chunked + non-range, so we buffer the whole
                //    window and return a plain 200.
                //  • raw segment file (path == segment id): bounded Range relay of
                //    /api/recordings/{id}/file (used for clip download).
                let window_mode = segment_id == "playback";

                // Client's Range request (used by both modes).
                let raw_range = request
                    .headers()
                    .get("range")
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.to_string());
                let (rstart, rend) = raw_range
                    .as_deref()
                    .and_then(parse_range)
                    .unwrap_or((0, None));

                if window_mode {
                    // ── Playback window: muxed once, cached, range-served ──────
                    let key = format!("{pb_path}|{pb_start}|{pb_duration}");
                    let cache = app.state::<PlaybackCache>();

                    let full: Arc<Vec<u8>> = if let Some(c) = cache.get(&key) {
                        c
                    } else {
                        // Build the upstream query in a scope so the (non-Send)
                        // url-encoding serializer is dropped before the await.
                        let url = {
                            let mut ser = url::form_urlencoded::Serializer::new(String::new());
                            ser.append_pair("format", "fmp4")
                                .append_pair("duration", &pb_duration)
                                .append_pair("path", &pb_path)
                                .append_pair("start", &pb_start);
                            // macOS WKWebView decodes HEVC natively, so keep the
                            // backend's cheap HEVC passthrough there. WebView2
                            // (Windows/Chromium) and WebKitGTK (Linux) have no
                            // HEVC decoder, so ask the backend for H.264.
                            if !cfg!(target_os = "macos") {
                                ser.append_pair("vcodec", "h264");
                            }
                            format!("{host}/api/_playback/get?{}", ser.finish())
                        };
                        let t0 = std::time::Instant::now();
                        eprintln!(
                            "[proxy] window MISS path={pb_path} start={pb_start} dur={pb_duration}"
                        );
                        let resp = match state
                            .http
                            .get(&url)
                            .header("Authorization", format!("Bearer {token}"))
                            .send()
                            .await
                        {
                            Ok(r) => r,
                            Err(e) => {
                                eprintln!("[proxy]   <- REQUEST FAILED: {e}");
                                responder.respond(err_resp(502, e.to_string()));
                                return;
                            }
                        };
                        if !resp.status().is_success() {
                            let st = resp.status().as_u16();
                            let body =
                                resp.bytes().await.map(|b| b.to_vec()).unwrap_or_default();
                            eprintln!("[proxy]   <- UPSTREAM ERROR status={st}");
                            responder.respond(
                                tauri::http::Response::builder()
                                    .status(st)
                                    .header("content-type", "text/plain")
                                    .body(body)
                                    .unwrap(),
                            );
                            return;
                        }
                        let mut v = match resp.bytes().await {
                            Ok(b) => b.to_vec(),
                            Err(e) => {
                                responder.respond(err_resp(500, e.to_string()));
                                return;
                            }
                        };
                        // macOS only: retag HEVC 'hev1' → 'hvc1' in the moov at
                        // the front (WKWebView requires 'hvc1'). Other platforms
                        // get H.264 above, which has no such tag.
                        if cfg!(target_os = "macos") {
                            let scan = v.len().min(0x10000);
                            let mut i = 0;
                            while i + 4 <= scan {
                                if &v[i..i + 4] == b"hev1" {
                                    v[i..i + 4].copy_from_slice(b"hvc1");
                                }
                                i += 1;
                            }
                        }
                        eprintln!(
                            "[proxy]   <- muxed+cached bytes={} elapsed={:?}",
                            v.len(),
                            t0.elapsed()
                        );
                        let arc = Arc::new(v);
                        cache.put(key, arc.clone());
                        arc
                    };

                    // Serve the requested range (or whole resource) from cache.
                    let total = full.len();
                    let base = tauri::http::Response::builder()
                        .header("content-type", "video/mp4")
                        .header("accept-ranges", "bytes");
                    let resp = if raw_range.is_some() {
                        let s = (rstart as usize).min(total);
                        let e = match rend {
                            Some(e) => (e as usize + 1).min(total),
                            None => total,
                        }
                        .max(s);
                        let slice = full[s..e].to_vec();
                        base.status(206)
                            .header(
                                "content-range",
                                format!("bytes {}-{}/{}", s, e.saturating_sub(1).max(s), total),
                            )
                            .header("content-length", slice.len().to_string())
                            .body(slice)
                            .unwrap()
                    } else {
                        base.status(200)
                            .header("content-length", total.to_string())
                            .body(full.as_ref().clone())
                            .unwrap()
                    };
                    responder.respond(resp);
                    return;
                }

                // ── Raw segment file: bounded Range relay (clip download) ──────
                let mut upstream_end = rstart.saturating_add(CHUNK_SIZE - 1);
                if let Some(e) = rend {
                    if e < upstream_end {
                        upstream_end = e;
                    }
                }
                let url = format!("{host}/api/recordings/{segment_id}/file");
                let t0 = std::time::Instant::now();
                eprintln!(
                    "[proxy] seg={} client_range={:?} -> upstream bytes={}-{}",
                    &segment_id[..segment_id.len().min(8)],
                    raw_range,
                    rstart,
                    upstream_end
                );
                let req = state
                    .http
                    .get(&url)
                    .header("Authorization", format!("Bearer {token}"))
                    .header("Range", format!("bytes={rstart}-{upstream_end}"));

                match req.send().await {
                    Ok(resp) => {
                        let status = resp.status();
                        let content_type = resp
                            .headers()
                            .get("content-type")
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or("video/mp4")
                            .to_string();
                        let content_range = resp
                            .headers()
                            .get("content-range")
                            .and_then(|v| v.to_str().ok())
                            .map(|s| s.to_string());

                        if !status.is_success() {
                            let body =
                                resp.bytes().await.map(|b| b.to_vec()).unwrap_or_default();
                            responder.respond(
                                tauri::http::Response::builder()
                                    .status(status.as_u16())
                                    .header("content-type", content_type)
                                    .body(body)
                                    .unwrap(),
                            );
                            return;
                        }

                        match resp.bytes().await {
                            Ok(bytes) => {
                                let mut vec = bytes.to_vec();
                                if rstart == 0 {
                                    let scan = vec.len().min(0x10000);
                                    let mut i = 0;
                                    while i + 4 <= scan {
                                        if &vec[i..i + 4] == b"hev1" {
                                            vec[i..i + 4].copy_from_slice(b"hvc1");
                                        }
                                        i += 1;
                                    }
                                }
                                let len = vec.len();
                                eprintln!(
                                    "[proxy]   <- status={} bytes={} elapsed={:?}",
                                    status.as_u16(),
                                    len,
                                    t0.elapsed()
                                );
                                let mut builder = tauri::http::Response::builder()
                                    .status(206)
                                    .header("content-type", content_type)
                                    .header("accept-ranges", "bytes")
                                    .header("content-length", len.to_string());
                                if let Some(cr) = content_range {
                                    builder = builder.header("content-range", cr);
                                }
                                responder.respond(builder.body(vec).unwrap());
                            }
                            Err(e) => responder.respond(err_resp(500, e.to_string())),
                        }
                    }
                    Err(e) => {
                        eprintln!("[proxy]   <- REQUEST FAILED: {e}");
                        responder.respond(err_resp(502, e.to_string()));
                    }
                }
            });
        })
        .setup(|app| {
            let tofu_state = tofu::TofuState::init(&app.handle())
                .map_err(|e| -> Box<dyn std::error::Error> {
                    Box::new(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("TOFU init failed: {e}"),
                    ))
                })?;
            app.manage(tofu_state);
            app.manage(events::EventStreamState::default());
            app.manage(PlaybackCache::default());
            app.manage(live_mjpeg::LiveMjpegState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            playback_window,
            tofu::tofu_peek_cert,
            tofu::tofu_trust_cert,
            tofu::tofu_untrust_cert,
            tofu::tofu_list_trusted,
            tofu::tofu_http_request,
            secure_store::secure_store,
            secure_store::secure_load,
            secure_store::secure_delete,
            events::events_start,
            events::events_stop,
            live_mjpeg::live_start,
            live_mjpeg::live_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
