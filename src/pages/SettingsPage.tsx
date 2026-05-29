import { useEffect, useState } from "react";
import { Plug, ShieldCheck, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { listTrusted, untrustCert, urlToHostPort, isTauri } from "@/lib/fingerprint";
import { useAuthStore } from "@/stores/auth";
import { useCameras, useSystemHealth } from "@/hooks/useCameras";

// Title in sidebar is "Connections" — multi-server is V1.5; for V1 this is
// effectively a read-only view of the single active server + the TOFU trust
// store, with the ability to drop stale fingerprints.

export function SettingsPage() {
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const cameras = useCameras();
  const system = useSystemHealth();

  const [trusted, setTrusted] = useState<Record<string, string>>({});
  const [trustedLoading, setTrustedLoading] = useState(false);

  async function refreshTrusted() {
    if (!isTauri()) return;
    setTrustedLoading(true);
    try {
      setTrusted(await listTrusted());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load trust store");
    } finally {
      setTrustedLoading(false);
    }
  }

  useEffect(() => {
    void refreshTrusted();
  }, []);

  const currentHostPort = serverUrl ? safeHostPort(serverUrl) : null;
  const currentFingerprint = currentHostPort ? trusted[currentHostPort] : undefined;
  const systemStatus: "online" | "offline" | "loading" = system.isLoading
    ? "loading"
    : system.error
      ? "offline"
      : "online";

  async function handleUntrust(hostPort: string) {
    try {
      await untrustCert(hostPort);
      toast.success(`Removed ${hostPort} from trust store`);
      await refreshTrusted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Untrust failed");
    }
  }

  return (
    <AppShell title="Connections">
      <div className="px-10 py-10">
        <div className="mb-3 inline-flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
          <span className="block h-px w-4 bg-accent" />
          Server connection
        </div>
        <h1 className="mb-8 text-[32px] font-bold leading-none tracking-tight">
          Connections<span className="text-accent">.</span>
        </h1>

        {/* Active server */}
        <section className="mb-8">
          <h2 className="mb-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
            Active server
          </h2>
          <div className="rounded-card border border-border-subtle bg-canvas-raised p-5">
            {!serverUrl ? (
              <p className="text-[13px] text-text-secondary">No active server.</p>
            ) : (
              <div className="flex items-start gap-4">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent-subtle">
                  <Plug className="h-4 w-4 text-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-mono text-[13px] font-semibold text-text-primary">
                      {serverUrl.replace(/^https?:\/\//, "")}
                    </p>
                    <StatusBadge status={systemStatus} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-[11.5px] text-text-secondary">
                    <KV label="Cameras">{cameras.data?.length ?? "—"}</KV>
                    <KV label="Recording">
                      {cameras.data?.filter((c) => c.record_enabled).length ?? "—"}
                    </KV>
                    {currentFingerprint && (
                      <KV label="Fingerprint" className="col-span-2">
                        <span className="break-all">{currentFingerprint}</span>
                      </KV>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* TOFU trust store */}
        <section>
          <h2 className="mb-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
            Trusted fingerprints
          </h2>

          {trustedLoading && (
            <div className="flex items-center gap-2 rounded-card border border-border-subtle bg-canvas-raised p-5">
              <Loader2 className="h-4 w-4 animate-spin text-text-tertiary" />
              <span className="font-mono text-[11.5px] text-text-tertiary">
                Loading trust store…
              </span>
            </div>
          )}

          {!trustedLoading && Object.keys(trusted).length === 0 && (
            <div className="rounded-card border border-dashed border-border bg-canvas-raised px-5 py-6 text-center">
              <p className="text-[13px] text-text-secondary">
                No certificates trusted yet.
              </p>
            </div>
          )}

          {!trustedLoading && Object.keys(trusted).length > 0 && (
            <div className="overflow-hidden rounded-card border border-border-subtle bg-canvas-raised">
              {Object.entries(trusted).map(([hostPort, fp], i) => {
                const isCurrent = hostPort === currentHostPort;
                return (
                  <div
                    key={hostPort}
                    className={
                      "flex items-start gap-4 px-5 py-4" +
                      (i > 0 ? " border-t border-border-subtle" : "")
                    }
                  >
                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-status-online-subtle">
                      <ShieldCheck className="h-3.5 w-3.5 text-status-online" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-mono text-[12.5px] font-semibold text-text-primary">
                          {hostPort}
                        </span>
                        {isCurrent && (
                          <Badge variant="active" className="font-mono text-[9.5px] uppercase tracking-[0.08em]">
                            current
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 break-all font-mono text-[11px] text-text-secondary">
                        {fp}
                      </p>
                    </div>
                    <button
                      onClick={() => handleUntrust(hostPort)}
                      disabled={isCurrent}
                      title={isCurrent ? "Can't untrust the active server" : "Remove from trust store"}
                      aria-label="Untrust"
                      className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-text-tertiary transition-colors hover:bg-status-critical-subtle hover:text-status-critical disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-tertiary"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <p className="mt-8 font-mono text-[11px] text-text-tertiary">
          Multi-server connections are planned for V1.5. The TOFU trust store
          already supports multiple host pins so a future client can switch
          between servers without re-prompting.
        </p>
      </div>
    </AppShell>
  );
}

function safeHostPort(url: string): string | null {
  try {
    return urlToHostPort(url);
  } catch {
    return null;
  }
}

function StatusBadge({ status }: { status: "online" | "offline" | "loading" }) {
  if (status === "loading") {
    return (
      <Badge variant="offline" className="font-mono text-[9.5px] uppercase tracking-[0.08em]">
        Checking…
      </Badge>
    );
  }
  if (status === "online") {
    return (
      <Badge variant="online" className="font-mono text-[9.5px] uppercase tracking-[0.08em]">
        Online
      </Badge>
    );
  }
  return (
    <Badge variant="critical" className="font-mono text-[9.5px] uppercase tracking-[0.08em]">
      Unreachable
    </Badge>
  );
}

function KV({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <span className="text-text-tertiary">{label}: </span>
      <span className="text-text-primary">{children}</span>
    </div>
  );
}
