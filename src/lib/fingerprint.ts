import { invoke } from "@tauri-apps/api/core";

// JS-side wrapper around the Tauri TOFU commands (src-tauri/src/tofu.rs).
// All real Supervision backend requests go through the pinning HTTP client in
// Rust; this file is the surface UI components and api/ functions use to peek
// and trust certs.

export interface CertInfo {
  host_port: string;
  fingerprint_sha256: string;
  fingerprint_pretty: string;
  subject: string;
  issuer: string;
  valid_from: string;
  valid_to: string;
  serial: string;
  already_trusted: boolean;
  previously_trusted_fingerprint: string | null;
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function peekCert(url: string): Promise<CertInfo> {
  return invoke<CertInfo>("tofu_peek_cert", { url });
}

export async function trustCert(
  hostPort: string,
  fingerprintSha256: string
): Promise<void> {
  await invoke("tofu_trust_cert", {
    hostPort,
    fingerprintSha256,
  });
}

export async function untrustCert(hostPort: string): Promise<void> {
  await invoke("tofu_untrust_cert", { hostPort });
}

export async function listTrusted(): Promise<Record<string, string>> {
  return invoke<Record<string, string>>("tofu_list_trusted");
}

// Extract "host:port" from a URL the same way Rust's host_port() does.
export function urlToHostPort(url: string): string {
  const u = new URL(url);
  const defaultPort = u.protocol === "https:" ? "443" : "80";
  const port = u.port || defaultPort;
  return `${u.hostname.toLowerCase()}:${port}`;
}
