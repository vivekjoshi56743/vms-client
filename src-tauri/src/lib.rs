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
