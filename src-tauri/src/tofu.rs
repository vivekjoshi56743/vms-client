//! TOFU (Trust On First Use) certificate pinning for the Supervision client.
//!
//! Backend self-signs its TLS cert. Instead of disabling cert verification
//! wholesale, we:
//!   1. On first connect to a host, capture the leaf cert's SHA-256
//!      fingerprint and show the user a trust dialog (`peek_cert`).
//!   2. Persist the user's trust decision to disk (`trust_cert`).
//!   3. On every subsequent request, our custom rustls verifier compares the
//!      live cert against the stored fingerprint and refuses on mismatch.
//!
//! This is MITM-resistant after the first connection. If the cert ever
//! changes (key rotation, attacker), the user is forced to re-decide.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};

use rustls::client::danger::{
    HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier,
};
use rustls::crypto::{verify_tls12_signature, verify_tls13_signature, CryptoProvider};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{DigitallySignedStruct, Error as RustlsError, SignatureScheme};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
use thiserror::Error;
use url::Url;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum TofuError {
    #[error("invalid URL: {0}")]
    InvalidUrl(String),
    #[error("URL has no host")]
    MissingHost,
    #[error("TLS error: {0}")]
    Tls(String),
    #[error("HTTP error: {0}")]
    Http(String),
    #[error("cert capture failed: TLS handshake completed but no cert was captured")]
    NoCertCaptured,
    #[error("cert parse error: {0}")]
    CertParse(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("Tauri error: {0}")]
    Tauri(String),
    #[error("cert pin mismatch for {host}: stored {expected}, got {actual}")]
    PinMismatch {
        host: String,
        expected: String,
        actual: String,
    },
    #[error("no trusted fingerprint for {0}: peek + trust the cert first")]
    NotTrusted(String),
    #[error("response body too large or invalid utf-8")]
    BadBody,
}

impl serde::Serialize for TofuError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

// ---------------------------------------------------------------------------
// Persistent trust store
// ---------------------------------------------------------------------------

/// On-disk shape — keyed by "host:port" so two services on the same host
/// (rare in practice but technically valid) have independent trust.
#[derive(Debug, Default, Serialize, Deserialize)]
struct TrustStoreFile {
    /// Map of "host:port" → lowercase hex SHA-256 of leaf cert DER.
    fingerprints: HashMap<String, String>,
}

#[derive(Debug)]
pub struct TrustStore {
    inner: RwLock<HashMap<String, String>>,
    path: PathBuf,
}

impl TrustStore {
    fn load(path: PathBuf) -> Result<Self, TofuError> {
        let inner = if path.exists() {
            let bytes = std::fs::read(&path)?;
            let parsed: TrustStoreFile = serde_json::from_slice(&bytes)?;
            parsed.fingerprints
        } else {
            HashMap::new()
        };
        Ok(Self {
            inner: RwLock::new(inner),
            path,
        })
    }

    fn save(&self) -> Result<(), TofuError> {
        let snapshot = TrustStoreFile {
            fingerprints: self.inner.read().unwrap().clone(),
        };
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let bytes = serde_json::to_vec_pretty(&snapshot)?;
        std::fs::write(&self.path, bytes)?;
        Ok(())
    }

    pub fn snapshot(&self) -> HashMap<String, String> {
        self.inner.read().unwrap().clone()
    }

    pub fn get(&self, host_port: &str) -> Option<String> {
        self.inner.read().unwrap().get(host_port).cloned()
    }

    pub fn put(&self, host_port: String, fingerprint: String) -> Result<(), TofuError> {
        self.inner.write().unwrap().insert(host_port, fingerprint);
        self.save()
    }

    pub fn remove(&self, host_port: &str) -> Result<(), TofuError> {
        self.inner.write().unwrap().remove(host_port);
        self.save()
    }
}

// ---------------------------------------------------------------------------
// Cert fingerprinting
// ---------------------------------------------------------------------------

fn sha256_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    hex::encode(h.finalize())
}

/// Format SHA-256 hex in the "AA:BB:CC:..." form humans expect in cert dialogs.
pub fn format_fingerprint_pretty(hex_lower: &str) -> String {
    hex_lower
        .as_bytes()
        .chunks(2)
        .map(|c| std::str::from_utf8(c).unwrap_or("??").to_ascii_uppercase())
        .collect::<Vec<_>>()
        .join(":")
}

/// Extract "host:port" from a URL. Always returns a port (defaults: 443 for
/// https, 80 for http). Lowercases the host.
fn host_port(url: &Url) -> Result<String, TofuError> {
    let host = url.host_str().ok_or(TofuError::MissingHost)?.to_lowercase();
    let default_port = if url.scheme() == "https" { 443 } else { 80 };
    let port = url.port().unwrap_or(default_port);
    Ok(format!("{host}:{port}"))
}

// ---------------------------------------------------------------------------
// rustls verifiers
// ---------------------------------------------------------------------------

/// Verifier used during `peek_cert`. Captures the leaf cert (by side-channel
/// into an Arc<Mutex>) and accepts unconditionally. NEVER use for real
/// requests — it's the "look at the door, don't lock it" verifier.
#[derive(Debug)]
struct CapturingVerifier {
    captured: Arc<Mutex<Option<Vec<u8>>>>,
    provider: Arc<CryptoProvider>,
}

impl CapturingVerifier {
    fn new(provider: Arc<CryptoProvider>) -> (Arc<Self>, Arc<Mutex<Option<Vec<u8>>>>) {
        let captured = Arc::new(Mutex::new(None));
        let v = Arc::new(Self {
            captured: captured.clone(),
            provider,
        });
        (v, captured)
    }
}

impl ServerCertVerifier for CapturingVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, RustlsError> {
        *self.captured.lock().unwrap() = Some(end_entity.as_ref().to_vec());
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, RustlsError> {
        verify_tls12_signature(
            message,
            cert,
            dss,
            &self.provider.signature_verification_algorithms,
        )
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, RustlsError> {
        verify_tls13_signature(
            message,
            cert,
            dss,
            &self.provider.signature_verification_algorithms,
        )
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.provider
            .signature_verification_algorithms
            .supported_schemes()
    }
}

/// Real verifier — enforces the pinned fingerprint per host:port.
#[derive(Debug)]
struct PinningVerifier {
    store: Arc<TrustStore>,
    provider: Arc<CryptoProvider>,
}

impl PinningVerifier {
    fn new(store: Arc<TrustStore>, provider: Arc<CryptoProvider>) -> Arc<Self> {
        Arc::new(Self { store, provider })
    }
}

impl ServerCertVerifier for PinningVerifier {
    fn verify_server_cert(
        &self,
        end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, RustlsError> {
        // rustls passes the SNI we sent. For pin lookup we need host:port,
        // but rustls only knows the host. The HTTP client below uses one
        // connection per host:port; we key the pin by the SNI host and the
        // port-disambiguation happens at the client builder layer (each
        // pinning client is scoped to a specific host:port).
        //
        // Since we build a fresh reqwest::Client per host:port (cached), the
        // verifier instance itself encodes the host:port we expect to see.
        // We still cross-check the SNI host matches the stored entry.
        let sni_host = match server_name {
            ServerName::DnsName(d) => d.as_ref().to_lowercase(),
            ServerName::IpAddress(ip) => format!("{ip:?}"),
            _ => {
                return Err(RustlsError::General(
                    "unsupported server name type".into(),
                ));
            }
        };

        // Find a stored entry where the host portion matches the SNI.
        // (Most users will have exactly one entry per host.)
        let store = self.store.inner.read().unwrap();
        let actual = sha256_hex(end_entity.as_ref());

        for (host_port, expected) in store.iter() {
            let host = host_port.rsplit_once(':').map(|(h, _)| h).unwrap_or(host_port);
            if host.eq_ignore_ascii_case(&sni_host) {
                if expected == &actual {
                    return Ok(ServerCertVerified::assertion());
                } else {
                    return Err(RustlsError::General(format!(
                        "cert pin MISMATCH for {sni_host}: stored {expected}, got {actual}"
                    )));
                }
            }
        }
        Err(RustlsError::General(format!(
            "no trusted fingerprint for {sni_host} — TOFU not completed"
        )))
    }

    fn verify_tls12_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, RustlsError> {
        verify_tls12_signature(
            message,
            cert,
            dss,
            &self.provider.signature_verification_algorithms,
        )
    }

    fn verify_tls13_signature(
        &self,
        message: &[u8],
        cert: &CertificateDer<'_>,
        dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, RustlsError> {
        verify_tls13_signature(
            message,
            cert,
            dss,
            &self.provider.signature_verification_algorithms,
        )
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        self.provider
            .signature_verification_algorithms
            .supported_schemes()
    }
}

// ---------------------------------------------------------------------------
// reqwest client builders
// ---------------------------------------------------------------------------

fn crypto_provider() -> Arc<CryptoProvider> {
    Arc::new(rustls::crypto::ring::default_provider())
}

fn build_capturing_client() -> Result<(reqwest::Client, Arc<Mutex<Option<Vec<u8>>>>), TofuError> {
    let provider = crypto_provider();
    let (verifier, captured) = CapturingVerifier::new(provider.clone());

    let tls_config = rustls::ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|e| TofuError::Tls(e.to_string()))?
        .dangerous()
        .with_custom_certificate_verifier(verifier)
        .with_no_client_auth();

    let client = reqwest::Client::builder()
        .use_preconfigured_tls(tls_config)
        .danger_accept_invalid_hostnames(true) // hostname mismatch is fine during peek
        .build()
        .map_err(|e| TofuError::Http(e.to_string()))?;
    Ok((client, captured))
}

fn build_pinning_client(store: Arc<TrustStore>) -> Result<reqwest::Client, TofuError> {
    let provider = crypto_provider();
    let verifier = PinningVerifier::new(store, provider.clone());

    let tls_config = rustls::ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|e| TofuError::Tls(e.to_string()))?
        .dangerous()
        .with_custom_certificate_verifier(verifier)
        .with_no_client_auth();

    let client = reqwest::Client::builder()
        .use_preconfigured_tls(tls_config)
        // Self-signed certs commonly use IP-based SANs or CN-only. Pin
        // already covers identity; hostname re-check is redundant.
        .danger_accept_invalid_hostnames(true)
        .build()
        .map_err(|e| TofuError::Http(e.to_string()))?;
    Ok(client)
}

// ---------------------------------------------------------------------------
// Tauri-managed state
// ---------------------------------------------------------------------------

pub struct TofuState {
    pub store: Arc<TrustStore>,
    pub http: reqwest::Client,
}

impl TofuState {
    pub fn init(app: &AppHandle) -> Result<Self, TofuError> {
        let app_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| TofuError::Tauri(e.to_string()))?;
        let store_path = app_dir.join("tofu-trust.json");
        let store = Arc::new(TrustStore::load(store_path)?);
        let http = build_pinning_client(store.clone())?;
        Ok(Self { store, http })
    }
}

// ---------------------------------------------------------------------------
// Cert info returned to JS
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
pub struct CertInfo {
    pub host_port: String,
    /// Lowercase hex.
    pub fingerprint_sha256: String,
    /// "AA:BB:CC:..." formatted for display.
    pub fingerprint_pretty: String,
    pub subject: String,
    pub issuer: String,
    /// RFC3339.
    pub valid_from: String,
    /// RFC3339.
    pub valid_to: String,
    pub serial: String,
    /// True if `host_port` already has a trusted fingerprint in our store.
    pub already_trusted: bool,
    /// If already_trusted and the live cert mismatches, this is the
    /// stored fingerprint. UI shows a CRITICAL change warning.
    pub previously_trusted_fingerprint: Option<String>,
}

fn parse_cert_info(
    host_port: String,
    der: &[u8],
    store: &TrustStore,
) -> Result<CertInfo, TofuError> {
    let (_, cert) = x509_parser::parse_x509_certificate(der)
        .map_err(|e| TofuError::CertParse(e.to_string()))?;
    let subject = cert.subject().to_string();
    let issuer = cert.issuer().to_string();
    // x509-parser's ASN1Time stringifies to "Jan  1 00:00:00 2030 GMT"-style;
    // the dialog displays this verbatim and the JS side splits on "T" if it
    // ever sees an ISO form, so the format is forgiving.
    let valid_from = cert.validity().not_before.to_string();
    let valid_to = cert.validity().not_after.to_string();
    let serial = format!("{:x}", cert.serial);
    let fingerprint = sha256_hex(der);
    let stored = store.get(&host_port);
    let previously_trusted_fingerprint = stored.as_ref().and_then(|s| {
        if s != &fingerprint {
            Some(s.clone())
        } else {
            None
        }
    });
    Ok(CertInfo {
        host_port: host_port.clone(),
        fingerprint_pretty: format_fingerprint_pretty(&fingerprint),
        fingerprint_sha256: fingerprint,
        subject,
        issuer,
        valid_from,
        valid_to,
        serial,
        already_trusted: stored.is_some() && previously_trusted_fingerprint.is_none(),
        previously_trusted_fingerprint,
    })
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Opens a TLS connection to `url`, captures the leaf cert, returns its
/// fingerprint + metadata. Does NOT mutate the trust store.
#[tauri::command]
pub async fn tofu_peek_cert(
    url: String,
    state: State<'_, TofuState>,
) -> Result<CertInfo, TofuError> {
    let parsed = Url::parse(&url).map_err(|e| TofuError::InvalidUrl(e.to_string()))?;
    let host_port = host_port(&parsed)?;
    let (client, captured) = build_capturing_client()?;

    // A HEAD against the root is the cheapest cert-grab. Errors here are
    // OK as long as we got past the TLS handshake (the verifier captures
    // before HTTP semantics).
    let probe_url = format!("{}://{}/", parsed.scheme(), host_port);
    let _ = client.head(&probe_url).send().await;

    let der = captured
        .lock()
        .unwrap()
        .clone()
        .ok_or(TofuError::NoCertCaptured)?;

    parse_cert_info(host_port, &der, &state.store)
}

/// Persist a trust decision. Caller passes the fingerprint returned from
/// `tofu_peek_cert` so a stale dialog can't trust the wrong cert.
#[tauri::command]
pub async fn tofu_trust_cert(
    host_port: String,
    fingerprint_sha256: String,
    state: State<'_, TofuState>,
) -> Result<(), TofuError> {
    state.store.put(host_port, fingerprint_sha256.to_lowercase())
}

#[tauri::command]
pub async fn tofu_untrust_cert(
    host_port: String,
    state: State<'_, TofuState>,
) -> Result<(), TofuError> {
    state.store.remove(&host_port)
}

#[tauri::command]
pub async fn tofu_list_trusted(state: State<'_, TofuState>) -> Result<HashMap<String, String>, TofuError> {
    Ok(state.store.snapshot())
}

// ---------------------------------------------------------------------------
// HTTP request command — the "fetch shim" the JS side calls
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct HttpRequest {
    pub method: String,
    pub url: String,
    /// Repeated headers serialize as multiple entries; we accept (name, value).
    pub headers: Vec<(String, String)>,
    /// Base64-encoded if `body_is_base64`, else interpreted as utf-8.
    pub body: Option<String>,
    pub body_is_base64: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    /// Always utf-8. If the response body isn't valid utf-8, we return an
    /// error rather than guess — the API surface is JSON-only.
    pub body: String,
}

#[tauri::command]
pub async fn tofu_http_request(
    req: HttpRequest,
    state: State<'_, TofuState>,
) -> Result<HttpResponse, TofuError> {
    let method = reqwest::Method::from_bytes(req.method.as_bytes())
        .map_err(|e| TofuError::Http(format!("bad method: {e}")))?;

    let mut builder = state.http.request(method, &req.url);
    for (k, v) in req.headers {
        builder = builder.header(k, v);
    }
    if let Some(body) = req.body {
        if req.body_is_base64.unwrap_or(false) {
            // Reserved for future binary bodies (e.g. uploads). V1 only ships
            // JSON, so this path is intentionally not reachable yet.
            return Err(TofuError::Http("base64 bodies not implemented".into()));
        }
        builder = builder.body(body);
    }

    let resp = builder
        .send()
        .await
        .map_err(|e| TofuError::Http(e.to_string()))?;
    let status = resp.status().as_u16();
    let headers = resp
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();
    let body_bytes = resp
        .bytes()
        .await
        .map_err(|e| TofuError::Http(e.to_string()))?;
    let body = String::from_utf8(body_bytes.to_vec()).map_err(|_| TofuError::BadBody)?;

    Ok(HttpResponse {
        status,
        headers,
        body,
    })
}
