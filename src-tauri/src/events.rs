// SSE bridge for /api/events.
//
// Why this isn't done in JavaScript:
//   - In production Tauri the WebView can't make HTTPS calls to a self-signed
//     backend — those go through `tofu::tofu_http_request` which buffers the
//     full response body. SSE needs streaming, so it can't ride that path.
//   - Native `EventSource` in the WebView can't attach an Authorization header
//     and the backend's /api/events doesn't accept a ?token= query param.
//
// Instead Rust opens the SSE connection using the same authenticated
// `reqwest::Client` that powers `tofu_http_request`, parses event frames
// (lines separated by \n\n, with `data:` payload lines), and emits each one
// to the frontend as a Tauri event named "sse-event". The frontend listens
// via @tauri-apps/api/event and routes the parsed envelope into TanStack
// Query cache invalidation + toasts.

use std::sync::Mutex;

use futures_util::StreamExt;
use tauri::{AppHandle, Emitter, Manager};

use crate::tofu::TofuState;

#[derive(Default)]
pub struct EventStreamState {
    handle: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

#[tauri::command]
pub async fn events_start(
    app: AppHandle,
    token: String,
    server_url: String,
    pattern: Option<String>,
) -> Result<(), String> {
    // Cancel any existing subscription before opening a new one.
    abort_existing(&app);

    let host = server_url.trim_end_matches('/');
    let url = format!("{host}/api/events");

    let tofu = app.state::<TofuState>();
    let mut req = tofu
        .http
        .get(&url)
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "text/event-stream");
    if let Some(p) = &pattern {
        req = req.query(&[("pattern", p.as_str())]);
    }

    let resp = req.send().await.map_err(|e| format!("connect: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let app_for_task = app.clone();
    let handle = tauri::async_runtime::spawn(async move {
        let mut stream = resp.bytes_stream();
        let mut buffer = String::new();
        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(bytes) => {
                    let Ok(text) = std::str::from_utf8(&bytes) else { continue };
                    buffer.push_str(text);
                    // Drain complete events (separated by \n\n).
                    while let Some(idx) = buffer.find("\n\n") {
                        let frame = buffer[..idx].to_string();
                        buffer.drain(..idx + 2);
                        // Concatenate any "data:" lines (per SSE spec) and
                        // emit the result. The backend currently sends one
                        // data line per event, but the spec allows multiple.
                        let mut data = String::new();
                        for line in frame.lines() {
                            if let Some(rest) = line.strip_prefix("data:") {
                                if !data.is_empty() {
                                    data.push('\n');
                                }
                                data.push_str(rest.trim_start());
                            }
                        }
                        if !data.is_empty() {
                            let _ = app_for_task.emit("sse-event", data);
                        }
                    }
                }
                Err(e) => {
                    let _ = app_for_task.emit("sse-error", e.to_string());
                    break;
                }
            }
        }
        let _ = app_for_task.emit("sse-closed", ());
    });

    let state = app.state::<EventStreamState>();
    *state.handle.lock().unwrap() = Some(handle);
    Ok(())
}

#[tauri::command]
pub async fn events_stop(app: AppHandle) -> Result<(), String> {
    abort_existing(&app);
    Ok(())
}

fn abort_existing(app: &AppHandle) {
    let state = app.state::<EventStreamState>();
    let prev = state.handle.lock().unwrap().take();
    if let Some(h) = prev {
        h.abort();
    }
}
