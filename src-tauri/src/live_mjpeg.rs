//! PoC: tolerant live view for Linux/WebKitGTK (hybrid — Linux only).
//!
//! WebKitGTK's MSE video sink enforces strict A/V sync and drops frames on
//! streams with irregular timestamps (our cameras run an odd ~19.25 fps), which
//! shows up as stutter regardless of the decoder — proven: even NVDEC on an RTX
//! 3090 still drops, so it is NOT a decode-throughput problem. VLC/mpv play the
//! same stream smoothly because they do NOT drop frames to chase a clock. We get
//! that same tolerance by decoding the stream OURSELVES and handing the WebView
//! only finished JPEGs, never touching MSE.
//!
//! Per camera we spawn `gst-launch-1.0` (already present on every Linux target —
//! bundled in the AppImage, declared as a .deb dep) to decode the MediaMTX RTSP
//! feed into a stream of JPEGs on stdout; a reader thread keeps the LATEST frame
//! in memory. The `liveframe://` URI scheme serves that frame and the frontend
//! canvas pulls it in a rAF loop (see `LiveMjpegView.tsx`). No MSE, no WebRTC, no
//! QoS — `<canvas>`/`<img>` decode is universal and has no "drop late frames"
//! behaviour.
//!
//! Linux-only at the call site (the frontend gates on platform); macOS/Windows
//! keep the native WHEP/HLS path, where their WebViews tolerate the stream fine.
//! `gst-launch-1.0` simply won't exist on those platforms, so `live_start` would
//! error there — which never happens because the frontend never calls it.

use std::collections::HashMap;
use std::io::Read;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

/// Latest JPEG frame for one camera, shared between the stdout reader thread and
/// the `liveframe://` scheme handler.
type Frame = Arc<Mutex<Vec<u8>>>;

struct CamHandle {
    frame: Frame,
    child: Child,
    alive: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct LiveMjpegState {
    cams: Mutex<HashMap<String, CamHandle>>,
}

impl LiveMjpegState {
    /// The current JPEG for a camera, if at least one frame has been decoded.
    pub fn frame_for(&self, camera_id: &str) -> Option<Vec<u8>> {
        let cams = self.cams.lock().unwrap();
        let h = cams.get(camera_id)?;
        let buf = h.frame.lock().unwrap();
        if buf.is_empty() {
            None
        } else {
            Some(buf.clone())
        }
    }
}

/// JPEG start-of-image marker. Inside JPEG entropy data every 0xFF byte is
/// byte-stuffed (`FF 00`), so `FF D8` can only appear at a true frame boundary —
/// which makes it a reliable delimiter for the concatenated MJPEG on stdout.
const SOI: [u8; 2] = [0xFF, 0xD8];

/// Scan the accumulator for SOI markers; publish the most recent COMPLETE frame
/// (the bytes between the last two SOIs) and drop everything before the final
/// SOI, so the buffer only ever holds the in-progress frame.
fn publish_latest(acc: &mut Vec<u8>, frame: &Frame) {
    let mut sois: Vec<usize> = Vec::new();
    let mut i = 0;
    while i + 1 < acc.len() {
        if acc[i] == SOI[0] && acc[i + 1] == SOI[1] {
            sois.push(i);
            i += 2;
        } else {
            i += 1;
        }
    }
    if sois.len() < 2 {
        return; // need start..next-start to have one complete frame
    }
    let last = *sois.last().unwrap();
    let prev = sois[sois.len() - 2];
    {
        let mut f = frame.lock().unwrap();
        *f = acc[prev..last].to_vec();
    }
    acc.drain(0..last);
}

/// Start decoding a camera's RTSP feed to MJPEG in the background. Idempotent —
/// a second call for a camera already running is a no-op.
#[tauri::command]
pub fn live_start(
    state: tauri::State<'_, LiveMjpegState>,
    camera_id: String,
    rtsp_url: String,
    fps: Option<u32>,
) -> Result<(), String> {
    let mut cams = state.cams.lock().unwrap();
    if cams.contains_key(&camera_id) {
        return Ok(());
    }
    let fps = fps.unwrap_or(15).clamp(1, 30);

    // `decodebin` auto-plugs depay/parse/decode. GST_PLUGIN_FEATURE_RANK set in
    // run() (parent env, inherited here) already demotes the broken nvv4l2decoder,
    // so this lands on software/NVDEC just like the WebView pipeline. `fdsink`
    // never drops frames — that tolerance is the entire point. Each gst-launch
    // token is a separate argv entry (RTSP URLs and caps contain no spaces).
    let pipeline = format!(
        "rtspsrc location={url} latency=200 protocols=tcp+udp ! \
         decodebin ! videoconvert ! videorate ! video/x-raw,framerate={fps}/1 ! \
         jpegenc quality=70 ! fdsink fd=1",
        url = rtsp_url,
        fps = fps,
    );

    let mut child = Command::new("gst-launch-1.0")
        .arg("-q")
        .args(pipeline.split(' ').filter(|s| !s.is_empty()))
        .stdout(Stdio::piped())
        // Inherit stderr so RTSP/decoder errors surface in the terminal during
        // the PoC (gst-launch is quiet unless something actually fails).
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("failed to spawn gst-launch-1.0: {e} (is GStreamer installed?)"))?;

    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| "no stdout from gst-launch-1.0".to_string())?;

    let frame: Frame = Arc::new(Mutex::new(Vec::new()));
    let alive = Arc::new(AtomicBool::new(true));

    {
        let frame = frame.clone();
        let alive = alive.clone();
        std::thread::spawn(move || {
            let mut acc: Vec<u8> = Vec::with_capacity(256 * 1024);
            let mut buf = [0u8; 64 * 1024];
            loop {
                if !alive.load(Ordering::Relaxed) {
                    break;
                }
                match stdout.read(&mut buf) {
                    Ok(0) => break, // EOF — the process exited
                    Ok(n) => {
                        acc.extend_from_slice(&buf[..n]);
                        publish_latest(&mut acc, &frame);
                    }
                    Err(_) => break,
                }
            }
        });
    }

    cams.insert(
        camera_id,
        CamHandle {
            frame,
            child,
            alive,
        },
    );
    Ok(())
}

/// Stop a camera's pipeline and free its frame buffer.
#[tauri::command]
pub fn live_stop(
    state: tauri::State<'_, LiveMjpegState>,
    camera_id: String,
) -> Result<(), String> {
    let mut cams = state.cams.lock().unwrap();
    if let Some(mut h) = cams.remove(&camera_id) {
        h.alive.store(false, Ordering::Relaxed);
        let _ = h.child.kill();
        let _ = h.child.wait();
    }
    Ok(())
}
