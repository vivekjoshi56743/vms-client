//! OS keychain wrapper for the session token.
//!
//! Uses the `keyring` crate which routes to the native secure storage on each
//! platform:
//!   - macOS   → Keychain Services
//!   - Windows → Windows Credential Manager (DPAPI-encrypted)
//!   - Linux   → Secret Service API (e.g. GNOME Keyring, KWallet)
//!
//! The service name is the app's bundle identifier so the credential is scoped
//! to this application.

use keyring::{Entry, Error as KrError};

const SERVICE: &str = "com.bipolarfactory.supervision";

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, key).map_err(|e| e.to_string())
}

/// Persist `value` under `key` in the OS keychain.
#[tauri::command]
pub fn secure_store(key: String, value: String) -> Result<(), String> {
    entry(&key)?.set_password(&value).map_err(|e| e.to_string())
}

/// Retrieve the value stored under `key`, or `null` if none exists.
#[tauri::command]
pub fn secure_load(key: String) -> Result<Option<String>, String> {
    match entry(&key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(KrError::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Delete the credential stored under `key`. No-ops if the entry doesn't exist.
#[tauri::command]
pub fn secure_delete(key: String) -> Result<(), String> {
    match entry(&key)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(KrError::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
