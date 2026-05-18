mod secure_store;
mod tofu;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // rustls 0.23 requires installing a crypto provider exactly once per
    // process before any TLS config is built.
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("failed to install rustls crypto provider");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
                for (k, v) in url::form_urlencoded::parse(query.as_bytes()) {
                    match k.as_ref() {
                        "token" => token = v.into_owned(),
                        "host" => host = v.into_owned(),
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
                let url = format!("{host}/api/recordings/{segment_id}/file");
                
                let mut req = state.http.get(&url).header("Authorization", format!("Bearer {token}"));
                
                // Forward Range header if WebKit sent one
                if let Some(r) = request.headers().get("range").and_then(|v| v.to_str().ok()) {
                    req = req.header("Range", r);
                }

                match req.send().await {
                    Ok(resp) => {
                        let status = resp.status();
                        let mut builder = tauri::http::Response::builder().status(status.as_u16());
                        
                        // Copy essential headers
                        let ct = resp.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("video/mp4");
                        builder = builder.header("content-type", ct);
                        
                        if let Some(cr) = resp.headers().get("content-range").and_then(|v| v.to_str().ok()) {
                            builder = builder.header("content-range", cr);
                        }
                        if let Some(cl) = resp.headers().get("content-length").and_then(|v| v.to_str().ok()) {
                            builder = builder.header("content-length", cl);
                        }
                        builder = builder.header("accept-ranges", "bytes");

                        match resp.bytes().await {
                            Ok(bytes) => {
                                let mut vec = bytes.to_vec();
                                
                                // On-the-fly codec tagging: WebKit strictly rejects HEVC 'hev1' tags.
                                // It requires 'hvc1'. We scan the chunk for 'hev1' and overwrite it.
                                // Since both are 4 bytes, this doesn't change file size or range offsets.
                                let hev1 = b"hev1";
                                let hvc1 = b"hvc1";
                                for i in 0..vec.len().saturating_sub(3) {
                                    if &vec[i..i+4] == hev1 {
                                        vec[i..i+4].copy_from_slice(hvc1);
                                    }
                                }
                                
                                responder.respond(builder.body(vec).unwrap());
                            }
                            Err(e) => {
                                responder.respond(
                                    tauri::http::Response::builder().status(500).body(e.to_string().into_bytes()).unwrap()
                                );
                            }
                        }
                    }
                    Err(e) => {
                        responder.respond(
                            tauri::http::Response::builder().status(502).body(e.to_string().into_bytes()).unwrap()
                        );
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            tofu::tofu_peek_cert,
            tofu::tofu_trust_cert,
            tofu::tofu_untrust_cert,
            tofu::tofu_list_trusted,
            tofu::tofu_http_request,
            secure_store::secure_store,
            secure_store::secure_load,
            secure_store::secure_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
