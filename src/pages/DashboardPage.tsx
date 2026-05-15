import { Link } from "react-router-dom";
import { Camera, Activity, Video, ArrowRight } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/stores/auth";
import { useCameras, useAllCameraHealth } from "@/hooks/useCameras";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function greeting(username: string): string {
  const hour = new Date().getHours();
  const period = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const name = username.charAt(0).toUpperCase() + username.slice(1);
  return `Good ${period}, ${name}`;
}

// ─── DashboardPage ────────────────────────────────────────────────────────────

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const cameras = useCameras();
  const health = useAllCameraHealth();

  const totalCameras = cameras.data?.length ?? 0;
  const onlineCount = health.data?.filter((h) => h.status === "online").length ?? 0;
  const offlineCount = health.data?.filter((h) => h.status === "offline" || h.status === "degraded").length ?? 0;
  const recordingCount = cameras.data?.filter((c) => c.record_enabled).length ?? 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-[1100px] px-8 py-8">

        {/* Greeting */}
        <h1 className="mb-6 text-[28px] font-semibold tracking-[-0.02em] text-text-primary">
          {user?.username ? greeting(user.username) : "Dashboard"}
        </h1>

        {/* Stats row */}
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            eyebrow="Cameras Online"
            icon={Camera}
            value={onlineCount}
            total={totalCameras}
            trend={
              offlineCount > 0
                ? { label: `${offlineCount} offline`, variant: "negative" }
                : totalCameras > 0
                  ? { label: "All online", variant: "positive" }
                  : undefined
            }
          />
          <StatCard
            eyebrow="Recording"
            icon={Activity}
            value={recordingCount}
            total={totalCameras}
            trend={
              recordingCount > 0
                ? { label: `${recordingCount} recording`, variant: "positive" }
                : { label: "None recording", variant: "neutral" }
            }
          />
          <StatCard
            eyebrow="Open Incidents"
            icon={Activity}
            value={0}
            trend={{ label: "No open incidents", variant: "neutral" }}
          />
          <StatCard
            eyebrow="NVRs Online"
            icon={Video}
            value={1}
            total={1}
            trend={{ label: "All connected", variant: "positive" }}
          />
        </div>

        {/* Two-column lower section */}
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">

          {/* Pinned cameras / recent cameras */}
          <div className="rounded-card border border-border-subtle bg-canvas-raised p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
                Cameras
                {totalCameras > 0 && (
                  <span className="ml-2 text-text-disabled">{totalCameras}</span>
                )}
              </p>
              <Link
                to="/cameras"
                className="inline-flex items-center gap-1 font-mono text-[11px] text-accent-text hover:underline"
              >
                Manage <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {cameras.isLoading ? (
              <CameraListSkeleton />
            ) : (cameras.data?.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Camera className="h-8 w-8 text-text-disabled" />
                <div>
                  <p className="text-[14px] font-medium text-text-primary">No cameras yet</p>
                  <p className="mt-1 text-[13px] text-text-secondary">
                    Add cameras from the Cameras page to get started.
                  </p>
                </div>
                <Link
                  to="/cameras"
                  className="mt-1 inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-text-secondary hover:bg-surface hover:text-text-primary"
                >
                  <Camera className="h-3.5 w-3.5" /> Add Camera
                </Link>
              </div>
            ) : (
              <ul className="space-y-1">
                {cameras.data!.slice(0, 8).map((cam) => {
                  const camHealth = health.data?.find((h) => h.camera_id === cam.id);
                  return (
                    <li key={cam.id} className="flex items-center gap-3 rounded px-2 py-1.5 hover:bg-surface">
                      <span
                        className="h-[7px] w-[7px] flex-shrink-0 rounded-full"
                        style={{
                          background: camHealth?.status === "online"
                            ? "var(--status-online)"
                            : camHealth?.status === "offline"
                              ? "var(--status-critical)"
                              : "var(--status-offline)",
                        }}
                      />
                      <span className="flex-1 truncate font-mono text-[12px] text-text-primary">
                        {cam.name}
                      </span>
                      <span
                        className="font-mono text-[10.5px] capitalize"
                        style={{
                          color: camHealth?.status === "online"
                            ? "var(--status-online)"
                            : camHealth?.status === "offline"
                              ? "var(--status-critical)"
                              : "var(--text-tertiary)",
                        }}
                      >
                        {camHealth?.status ?? "unknown"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Connected server card */}
          <div className="flex flex-col gap-3">
            <div className="rounded-card border border-border-subtle bg-canvas-raised p-5">
              <p className="mb-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
                Connected Server
              </p>
              <div className="flex items-center gap-2.5">
                <span
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{
                    background: "var(--server-1)",
                    boxShadow: "0 0 8px var(--accent-glow)",
                  }}
                />
                <div className="min-w-0">
                  <p className="truncate font-mono text-[12.5px] font-semibold text-text-primary">
                    {serverUrl
                      ? serverUrl.replace(/^https?:\/\//, "")
                      : "Not connected"}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-text-tertiary">
                    {totalCameras} cameras
                    {recordingCount > 0 && ` · ${recordingCount} recording`}
                  </p>
                </div>
              </div>
            </div>

            {/* Quick links */}
            <div className="rounded-card border border-border-subtle bg-canvas-raised p-4">
              <p className="mb-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
                Quick Access
              </p>
              <div className="space-y-1">
                {[
                  { to: "/live",     icon: Video,     label: "Live view" },
                  { to: "/cameras",  icon: Camera,    label: "Cameras" },
                  { to: "/health",   icon: Activity,  label: "Health" },
                ].map(({ to, icon: Icon, label }) => (
                  <Link
                    key={to}
                    to={to}
                    className="flex items-center gap-2.5 rounded px-2 py-1.5 text-[13px] text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
                  >
                    <Icon className="h-[15px] w-[15px] flex-shrink-0 text-text-tertiary" />
                    {label}
                    <ArrowRight className="ml-auto h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  eyebrow,
  icon: Icon,
  value,
  total,
  trend,
}: {
  eyebrow: string;
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  total?: number;
  trend?: { label: string; variant: "positive" | "negative" | "neutral" };
}) {
  const trendColor = {
    positive: "var(--status-online)",
    negative: "var(--status-critical)",
    neutral: "var(--text-tertiary)",
  };

  return (
    <div className="rounded-card border border-border-subtle bg-canvas-raised p-5">
      <div className="mb-3.5 flex items-center justify-between">
        <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
          {eyebrow}
        </p>
        <Icon className="h-4 w-4 text-text-disabled" />
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-[36px] font-medium leading-none tracking-[-0.04em] text-text-primary">
          {value}
        </span>
        {total !== undefined && (
          <span className="font-mono text-[14px] text-text-tertiary">
            / {total}
          </span>
        )}
      </div>

      {trend && (
        <p className="mt-2.5 font-mono text-[11.5px]" style={{ color: trendColor[trend.variant] }}>
          {trend.label}
        </p>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function CameraListSkeleton() {
  return (
    <ul className="space-y-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-2 py-1.5">
          <span className="h-[7px] w-[7px] flex-shrink-0 rounded-full bg-surface-active animate-shimmer" />
          <span className="h-3 w-32 rounded bg-surface-active animate-shimmer" />
          <span className="ml-auto h-3 w-12 rounded bg-surface-active animate-shimmer" />
        </li>
      ))}
    </ul>
  );
}
