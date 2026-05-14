import { AlertTriangle, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CertInfo } from "@/lib/fingerprint";

// One-time prompt the first time the user connects to a self-signed server.
// On subsequent connections the pinning verifier (src-tauri/src/tofu.rs)
// short-circuits the handshake; this dialog only re-appears if the cert
// changes — in which case the previous fingerprint is shown alongside the
// new one with a critical-mismatch warning.

interface Props {
  open: boolean;
  cert: CertInfo | null;
  // If true, the cert is a NEW one replacing a previously trusted one — the
  // dialog renders the critical-mismatch warning instead of a fresh-trust UI.
  isMismatch: boolean;
  onTrust: () => void;
  onCancel: () => void;
  pending?: boolean;
}

function MonoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-tertiary w-[88px] flex-shrink-0">
        {label}
      </span>
      <span className="font-mono text-[12.5px] text-text-primary break-all">
        {value}
      </span>
    </div>
  );
}

export function TOFUDialog({
  open,
  cert,
  isMismatch,
  onTrust,
  onCancel,
  pending,
}: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <div className="mb-3 inline-flex items-center gap-2">
            {isMismatch ? (
              <>
                <AlertTriangle className="h-4 w-4 text-status-critical" />
                <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-status-critical">
                  Certificate changed
                </span>
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4 text-accent" />
                <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent">
                  Trust this server?
                </span>
              </>
            )}
          </div>
          <DialogTitle>
            {isMismatch
              ? `${cert?.host_port ?? ""} presented a new certificate`
              : `First connection to ${cert?.host_port ?? ""}`}
          </DialogTitle>
          <DialogDescription>
            {isMismatch
              ? "The server's TLS certificate doesn't match the one you trusted previously. This may mean a legitimate rotation — or someone is intercepting the connection. Verify the new fingerprint out-of-band before trusting."
              : "Supervision servers use self-signed certificates. Trust-on-first-use pins this fingerprint so future connections are protected — but only if the fingerprint below matches what your admin gave you."}
          </DialogDescription>
        </DialogHeader>

        {cert && (
          <div className="mx-6 my-4 rounded-card border border-border bg-canvas-raised p-4">
            <div className="flex flex-col gap-2.5">
              <MonoRow label="Host" value={cert.host_port} />
              <MonoRow label="Subject" value={cert.subject} />
              <MonoRow label="Issuer" value={cert.issuer} />
              <MonoRow
                label="Valid"
                value={`${cert.valid_from.split("T")[0]} → ${cert.valid_to.split("T")[0]}`}
              />
              <MonoRow label="Serial" value={cert.serial} />
              <div className="mt-2 border-t border-border-subtle pt-2.5">
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant={isMismatch ? "critical" : "active"}>
                    SHA-256
                  </Badge>
                  {isMismatch && (
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-status-critical">
                      New fingerprint
                    </span>
                  )}
                </div>
                <p className="font-mono text-[12.5px] leading-snug text-text-primary break-all">
                  {cert.fingerprint_pretty}
                </p>
              </div>
              {isMismatch && cert.previously_trusted_fingerprint && (
                <div className="border-t border-border-subtle pt-2.5">
                  <div className="mb-1">
                    <Badge variant="warning">PREVIOUS</Badge>
                  </div>
                  <p className="font-mono text-[12.5px] leading-snug text-text-secondary break-all">
                    {formatPretty(cert.previously_trusted_fingerprint)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={isMismatch ? "danger" : "primary"}
            onClick={onTrust}
            disabled={pending || !cert}
          >
            {pending
              ? "Trusting…"
              : isMismatch
                ? "Trust new certificate"
                : "Trust and continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatPretty(hex: string): string {
  return hex
    .match(/.{1,2}/g)
    ?.map((p) => p.toUpperCase())
    .join(":") ?? hex;
}
