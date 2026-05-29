import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { useAllCameraHealth, useCameras, useSystemHealth } from "@/hooks/useCameras";
import { formatDistanceToNow } from "date-fns";

type BadgeVariant = "online" | "warning" | "critical" | "offline";

function statusToBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case "online":
      return "online";
    case "degraded":
      return "warning";
    case "offline":
      return "offline";
    default:
      return "offline";
  }
}

function formatTimestamp(rfc3339: string): string {
  if (!rfc3339) return "Never";
  try {
    return formatDistanceToNow(new Date(rfc3339), { addSuffix: true });
  } catch {
    return "Invalid date";
  }
}

export function HealthPage() {
  const health = useAllCameraHealth();
  const cameras = useCameras();
  const system = useSystemHealth();

  const cameraMap = new Map(cameras.data?.map((c) => [c.id, c]) ?? []);

  return (
    <AppShell title="Health">
      <div className="flex flex-col gap-6 p-6">
        {/* System Health */}
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">System Status</h2>
            <p className="mt-0.5 text-xs text-text-secondary">Overall backend connectivity</p>
          </div>
          <div className="rounded border border-surface-hover bg-canvas-raised p-4">
            {system.isLoading && (
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 animate-shimmer rounded-full bg-surface-active" />
                <span className="h-3 w-40 animate-shimmer rounded bg-surface-active" />
              </div>
            )}
            {system.error && (
              <p className="text-sm text-status-critical">
                Unable to reach backend
              </p>
            )}
            {system.data && (
              <p className="text-sm text-status-online">Backend is responding</p>
            )}
          </div>
        </section>

        {/* Per-Camera Health */}
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Camera Status</h2>
            <p className="mt-0.5 text-xs text-text-secondary">
              Last updated{" "}
              {health.dataUpdatedAt ? formatTimestamp(new Date(health.dataUpdatedAt).toISOString()) : "never"}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {health.isLoading && <CameraHealthSkeleton />}

            {health.error && (
              <div className="rounded border border-status-critical-subtle bg-status-critical-subtle/20 p-4">
                <p className="text-sm text-status-critical">
                  Failed to fetch camera health
                </p>
              </div>
            )}

            {health.data && health.data.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-text-tertiary">No cameras configured</p>
              </div>
            )}

            {health.data?.map((h) => {
              const camera = cameraMap.get(h.camera_id);
              return (
                <div
                  key={h.camera_id}
                  className="flex flex-col gap-2 rounded border border-surface-hover bg-canvas-raised p-4 transition-colors hover:border-surface-hover/80"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium text-text-primary">
                        {camera?.name ?? "Unknown Camera"}
                      </p>
                      <p className="mt-1 text-xs text-text-tertiary font-mono">
                        {h.camera_id}
                      </p>
                    </div>
                    <Badge variant={statusToBadgeVariant(h.status)}>
                      {h.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t border-surface-hover pt-3">
                    <div>
                      <p className="text-xs text-text-tertiary">Last Seen</p>
                      <p className="mt-1 font-mono text-xs text-text-secondary">
                        {formatTimestamp(h.last_seen)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-text-tertiary">Last Checked</p>
                      <p className="mt-1 font-mono text-xs text-text-secondary">
                        {formatTimestamp(h.last_checked)}
                      </p>
                    </div>
                  </div>

                  {h.last_error && (
                    <div className="border-t border-surface-hover pt-3">
                      <p className="text-xs text-text-tertiary">Last Error</p>
                      <p className="mt-1 font-mono text-xs text-status-critical break-words">
                        {h.last_error}
                      </p>
                    </div>
                  )}

                  <div className="border-t border-surface-hover pt-3">
                    <p className="text-xs text-text-tertiary">Source / Bytes Received</p>
                    <p className="mt-1 font-mono text-xs text-text-secondary">
                      {h.source} • {(h.bytes_received / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function CameraHealthSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 rounded border border-surface-hover bg-canvas-raised p-4"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <span className="block h-4 w-40 animate-shimmer rounded bg-surface-active" />
              <span className="mt-2 block h-3 w-56 animate-shimmer rounded bg-surface-active" />
            </div>
            <span className="h-5 w-16 animate-shimmer rounded-full bg-surface-active" />
          </div>
          <div className="grid grid-cols-2 gap-4 border-t border-surface-hover pt-3">
            <div>
              <span className="block h-2.5 w-16 animate-shimmer rounded bg-surface-active" />
              <span className="mt-2 block h-3 w-24 animate-shimmer rounded bg-surface-active" />
            </div>
            <div>
              <span className="block h-2.5 w-20 animate-shimmer rounded bg-surface-active" />
              <span className="mt-2 block h-3 w-24 animate-shimmer rounded bg-surface-active" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
