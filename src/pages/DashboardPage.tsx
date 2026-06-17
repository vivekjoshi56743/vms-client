import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Bell,
  Camera,
  Film,
  ShieldAlert,
  ShieldCheck,
  VideoOff,
  Server,
  AlertTriangle,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { AppShell } from "@/components/layout/AppShell";
import { VideoTile } from "@/components/video/VideoTile";
import { ConnectingSplash } from "@/components/video/ConnectingSplash";
import type { PlayerState } from "@/components/video/VideoPlayer";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { useAuthStore } from "@/stores/auth";
import { useCameras, useAllCameraHealth, useSystemHealth } from "@/hooks/useCameras";
import { useStreams } from "@/hooks/useStream";
import { useEventsStore, type EventLogItem } from "@/stores/events";
import { usePinnedStore, PINNED_LIMIT } from "@/stores/pinned";
import { PinnedCamerasDialog } from "@/components/dashboard/PinnedCamerasDialog";
import type { Camera as ApiCamera } from "@/api/cameras";
import type { CameraHealth } from "@/api/health";

// Mockup parity: greeting → pinned cameras strip → 4 stat cards → activity
// feed → connected servers → active alerts + open incidents.
//
// Real-data sections: pinned (stubbed as first 4 cameras until backend has
// a pin API), cameras-online, recording, activity feed (from SSE buffer),
// connected server, active alerts (derived from offline cameras + critical
// SSE events).
//
// Stubbed sections (clearly labelled): NVRs online, open incidents — these
// need backend endpoints that don't exist yet (see plan.md "NOT in V1").

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
  const system = useSystemHealth();
  // IMPORTANT: select the raw items array (stable reference between
  // renders unless events actually change), and slice in a useMemo. If we
  // sliced inside the selector, Zustand would see a new array on every
  // render and trigger an infinite re-render loop.
  const allEvents = useEventsStore((s) => s.items);
  const recentEvents = useMemo(() => allEvents.slice(0, 6), [allEvents]);

  const totalCameras = cameras.data?.length ?? 0;
  const onlineCount = health.data?.filter((h) => h.status === "online").length ?? 0;
  const offlineCount =
    health.data?.filter((h) => h.status === "offline" || h.status === "degraded").length ?? 0;
  const recordingCount = cameras.data?.filter((c) => c.record_enabled).length ?? 0;
  const recordingHealthy = useMemo(
    () =>
      (cameras.data ?? []).filter((c) => {
        if (!c.record_enabled) return false;
        const h = health.data?.find((x) => x.camera_id === c.id);
        return h?.status === "online";
      }).length,
    [cameras.data, health.data]
  );

  const healthMap = useMemo(
    () => Object.fromEntries((health.data ?? []).map((h) => [h.camera_id, h])),
    [health.data]
  );

  // Pinned cameras: user's saved selection from usePinnedStore (localStorage-
  // backed). On a fresh device with nothing pinned yet, fall back to the
  // first PINNED_LIMIT cameras so the strip isn't empty on first visit —
  // the user can curate from there via the Edit button.
  const pinnedSavedIds = usePinnedStore((s) => s.ids);
  const pinned = useMemo(() => {
    const all = cameras.data ?? [];
    // Resolve saved IDs against current camera list (drop any that no
    // longer exist), preserving the user's pin order.
    const resolved = pinnedSavedIds
      .map((id) => all.find((c) => c.id === id))
      .filter((c): c is ApiCamera => !!c);
    // Fall back to the first PINNED_LIMIT cameras whenever the resolved
    // list is empty — covers both a fresh device (nothing saved) AND the
    // case where saved IDs are from a different server and match nothing
    // here. Without this, the strip (and its Edit button) would vanish,
    // leaving no way to pin on the new server.
    if (resolved.length === 0) return all.slice(0, PINNED_LIMIT);
    return resolved;
  }, [cameras.data, pinnedSavedIds]);
  const pinnedIds = pinned.map((c) => c.id);
  const streams = useStreams(pinnedIds);

  const [pinDialogOpen, setPinDialogOpen] = useState(false);

  // Aggregate per-tile playback state for the pinned strip's connecting
  // splash. Driven by VideoTile.onStateChange callbacks below. Stale entries
  // for previously-pinned cameras are pruned whenever the pinned set
  // changes so they can't pad the "playing" count.
  const [tileStates, setTileStates] = useState<Record<string, PlayerState>>({});
  const handleTileStateChange = (cameraId: string, state: PlayerState) =>
    setTileStates((prev) => (prev[cameraId] === state ? prev : { ...prev, [cameraId]: state }));
  useEffect(() => {
    setTileStates((prev) => {
      const keep: Record<string, PlayerState> = {};
      for (const id of pinnedIds) if (prev[id]) keep[id] = prev[id]!;
      return keep;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedIds.join("|")]);

  // Active alerts: combine offline/degraded cameras + critical health events
  // from the SSE buffer. Deduplicated by camera id.
  const activeAlerts = useMemo(
    () => buildActiveAlerts(cameras.data ?? [], health.data ?? [], recentEvents),
    [cameras.data, health.data, recentEvents]
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-[1400px] px-8 py-8">
        {/* Greeting */}
        <h1 className="mb-6 text-[28px] font-semibold tracking-[-0.02em] text-text-primary">
          {user?.username ? greeting(user.username) : "Dashboard"}
        </h1>

        {/* Pinned cameras */}
        <PinnedCameras
          pinned={pinned}
          total={totalCameras}
          streams={streams}
          health={healthMap}
          tileStates={tileStates}
          onTileStateChange={handleTileStateChange}
          onEdit={() => setPinDialogOpen(true)}
        />

        {/* Stats row */}
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            eyebrow="Cameras online"
            icon={Camera}
            value={onlineCount}
            total={totalCameras}
            trend={
              offlineCount > 0
                ? { dir: "down", label: `${offlineCount} offline` }
                : totalCameras > 0
                  ? { dir: "flat", label: "All online" }
                  : null
            }
          />
          <StatCard
            eyebrow="NVRs online"
            icon={Server}
            value={system.error ? 0 : 1}
            total={1}
            trend={
              system.isLoading
                ? { dir: "flat", label: "Checking…" }
                : system.error
                  ? { dir: "down", label: "Unreachable" }
                  : { dir: "flat", label: "Single-server (V1)" }
            }
          />
          <StatCard
            eyebrow="Recording"
            icon={Activity}
            value={recordingHealthy}
            total={recordingCount}
            trendSuffix="healthy"
            trend={
              recordingCount === 0
                ? { dir: "flat", label: "None recording" }
                : recordingHealthy < recordingCount
                  ? { dir: "up", label: `${recordingCount - recordingHealthy} stream error` }
                  : { dir: "flat", label: "All healthy" }
            }
          />
          <StatCard
            eyebrow="Open incidents"
            icon={ShieldAlert}
            value={0}
            trend={{ dir: "flat", label: "Incidents API pending" }}
          />
        </div>

        {/* Since your last visit */}
        {recentEvents.length > 0 && (
          <ActivityFeed items={recentEvents} cameras={cameras.data ?? []} />
        )}

        {/* Connected servers */}
        <ConnectedServers
          serverUrl={serverUrl}
          cameras={totalCameras}
          recording={recordingCount}
          reachable={!system.error && !system.isLoading}
        />

        {/* Two-column: Active alerts + Open incidents */}
        <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
          <ActiveAlerts alerts={activeAlerts} />
          <OpenIncidents />
        </div>
      </div>

      <PinnedCamerasDialog open={pinDialogOpen} onOpenChange={setPinDialogOpen} />
    </AppShell>
  );
}

// ─── Pinned cameras ───────────────────────────────────────────────────────────

function PinnedCameras({
  pinned,
  total,
  streams,
  health,
  tileStates,
  onTileStateChange,
  onEdit,
}: {
  pinned: ApiCamera[];
  total: number;
  streams: Record<string, { webrtc: string | null; hls: string | null } | undefined>;
  health: Record<string, CameraHealth | undefined>;
  tileStates: Record<string, PlayerState>;
  onTileStateChange: (cameraId: string, state: PlayerState) => void;
  onEdit: () => void;
}) {
  if (pinned.length === 0) return null;
  const pinnedIds = pinned.map((c) => c.id);
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
          Pinned cameras <span className="text-text-disabled">· {pinned.length} of {total}</span>
        </p>
        <button
          onClick={onEdit}
          className="font-mono text-[11px] font-medium text-accent-text hover:underline"
        >
          Edit
        </button>
      </div>
      {/* Wrap the tile row in a relative container so ConnectingSplash can
          overlay just this strip (not the whole dashboard). The splash
          covers all four tiles at once with the M/N count + progress bar. */}
      <div className="relative">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {pinned.map((cam) => {
            const stream = streams[cam.id];
            const videoUrl = stream?.webrtc ?? stream?.hls ?? null;
            return (
              <div key={cam.id} className="aspect-video">
                <VideoTile
                  camera={cam}
                  url={videoUrl}
                  hlsFallback={stream?.hls ?? null}
                  health={health[cam.id]}
                  onStateChange={(s) => onTileStateChange(cam.id, s)}
                  className="h-full w-full"
                />
              </div>
            );
          })}
        </div>
        <ConnectingSplash
          slotCameraIds={pinnedIds}
          tileStates={tileStates}
          healthMap={health}
        />
      </div>
    </section>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

interface Trend {
  dir: "up" | "down" | "flat";
  label: string;
}

function StatCard({
  eyebrow,
  icon: Icon,
  value,
  total,
  trendSuffix,
  trend,
}: {
  eyebrow: string;
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  total?: number;
  trendSuffix?: string;
  trend: Trend | null;
}) {
  const trendColor =
    trend?.dir === "down"
      ? "var(--status-critical)"
      : trend?.dir === "up"
        ? "var(--status-warning)"
        : "var(--status-online)";

  const TrendIcon =
    trend?.dir === "down" ? ArrowDown : trend?.dir === "up" ? ArrowUp : null;

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
          <>
            <span className="font-mono text-[14px] text-text-tertiary">/ {total}</span>
            {trendSuffix && (
              <span className="ml-1 font-mono text-[12px] text-text-tertiary">{trendSuffix}</span>
            )}
          </>
        )}
      </div>

      {trend && (
        <p
          className="mt-2.5 inline-flex items-center gap-1 font-mono text-[11.5px]"
          style={{ color: trendColor }}
        >
          {TrendIcon && <TrendIcon className="h-3 w-3" />}
          {trend.label}
        </p>
      )}
    </div>
  );
}

// ─── Activity feed ────────────────────────────────────────────────────────────

function ActivityFeed({
  items,
  cameras,
}: {
  items: EventLogItem[];
  cameras: ApiCamera[];
}) {
  const earliest = items[items.length - 1]?.receivedAt ?? Date.now();
  const cameraName = (id: string) => cameras.find((c) => c.id === id)?.name ?? id;

  return (
    <section className="mb-6 overflow-hidden rounded-card border border-border-subtle bg-canvas-raised">
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
        <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
          Since your last visit
          <span className="ml-2 text-text-disabled">
            · {formatDistanceToNow(new Date(earliest), { addSuffix: false })} ago
          </span>
        </p>
        <Link
          to="/events"
          className="inline-flex items-center gap-1 font-mono text-[11px] text-text-tertiary hover:text-text-primary"
        >
          <X className="h-3 w-3" />
          Dismiss
        </Link>
      </div>
      <ul>
        {items.map((it, i) => (
          <ActivityRow
            key={it.id}
            item={it}
            cameraName={cameraName(it.entityId)}
            withBorder={i > 0}
          />
        ))}
      </ul>
    </section>
  );
}

function ActivityRow({
  item,
  cameraName,
  withBorder,
}: {
  item: EventLogItem;
  cameraName: string;
  withBorder: boolean;
}) {
  const { icon: Icon, color, summary, detail } = describeActivity(item, cameraName);
  return (
    <li
      className={cn(
        "flex items-start gap-3 px-5 py-3",
        withBorder && "border-t border-border-subtle"
      )}
    >
      <div
        className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded"
        style={{
          background: `color-mix(in srgb, var(--${color}) 18%, transparent)`,
          color: `var(--${color})`,
        }}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-text-primary">
          <span className="font-medium">{summary}</span>
          {detail && (
            <span className="ml-1 font-mono text-[11.5px] text-text-tertiary">
              · {detail}
            </span>
          )}
        </p>
      </div>
      <span className="flex-shrink-0 font-mono text-[10.5px] text-text-tertiary">
        {formatDistanceToNow(new Date(item.receivedAt), { addSuffix: true })}
      </span>
    </li>
  );
}

function describeActivity(item: EventLogItem, name: string): {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  summary: string;
  detail: string;
} {
  if (item.domain === "camera" && item.kind === "health") {
    const status = (item.data as { status?: string } | undefined)?.status;
    if (status === "offline" || status === "degraded") {
      return {
        icon: VideoOff,
        color: "status-critical",
        summary: `${name} went ${status}`,
        detail: item.entityId,
      };
    }
    return {
      icon: ShieldCheck,
      color: "status-online",
      summary: `${name} is back online`,
      detail: item.entityId,
    };
  }
  if (item.domain === "camera" && item.kind === "stream") {
    return {
      icon: Camera,
      color: "accent",
      summary: `Stream ${item.state} on ${name}`,
      detail: item.entityId,
    };
  }
  if (item.domain === "recording" && item.kind === "segment") {
    return {
      icon: Film,
      color: "accent",
      summary: `Recording segment ${item.state}`,
      detail: name,
    };
  }
  return {
    icon: Bell,
    color: "text-tertiary",
    summary: item.topic,
    detail: "",
  };
}

// ─── Connected servers ────────────────────────────────────────────────────────

function ConnectedServers({
  serverUrl,
  cameras,
  recording,
  reachable,
}: {
  serverUrl: string | null;
  cameras: number;
  recording: number;
  reachable: boolean;
}) {
  return (
    <section className="mb-6 overflow-hidden rounded-card border border-border-subtle bg-canvas-raised">
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
        <p className="text-[14px] font-semibold text-text-primary">Connected servers</p>
        <Link
          to="/settings"
          className="font-mono text-[11px] text-accent-text hover:underline"
        >
          Manage
        </Link>
      </div>
      <div className="grid gap-px bg-border-subtle lg:grid-cols-3">
        {/* Real server */}
        <ServerCard
          dotColor="var(--server-1)"
          name={serverUrl ? hostFromUrl(serverUrl) : "Primary"}
          cameras={cameras}
          recording={recording}
          uptime={reachable ? "online" : "unreachable"}
        />
        {/* The mockup shows multiple servers; we only have one in V1.
            Render a compact "Add server" placeholder for the other two so
            the section visually balances without faking data. */}
        <AddServerCard label="No additional server" />
        <AddServerCard label="Multi-server in V1.5" />
      </div>
    </section>
  );
}

function ServerCard({
  dotColor,
  name,
  cameras,
  recording,
  uptime,
}: {
  dotColor: string;
  name: string;
  cameras: number;
  recording: number;
  uptime: string;
}) {
  return (
    <div className="bg-canvas-raised px-5 py-4">
      <div className="mb-2 flex items-center gap-2.5">
        <span
          className="h-2 w-2 flex-shrink-0 rounded-full"
          style={{ background: dotColor, boxShadow: `0 0 6px ${dotColor}` }}
        />
        <span className="truncate text-[14px] font-semibold text-text-primary">
          {name}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11.5px] text-text-secondary">
        <KV label="cameras" value={cameras} />
        <KV label="recording" value={recording} />
        <KV label="status" value={uptime} />
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: number | string }) {
  return (
    <span>
      <span className="text-text-primary">{value}</span>
      <span className="ml-1 text-text-tertiary">{label}</span>
    </span>
  );
}

function AddServerCard({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center bg-canvas-raised px-5 py-4">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-text-disabled">
        {label}
      </span>
    </div>
  );
}

function hostFromUrl(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return u.replace(/^https?:\/\//, "");
  }
}

// ─── Active alerts ────────────────────────────────────────────────────────────

interface AlertItem {
  id: string;
  title: string;
  detail: string;
  severity: "critical" | "warning";
  timestamp: string;
}

function buildActiveAlerts(
  cameras: ApiCamera[],
  health: CameraHealth[],
  events: EventLogItem[]
): AlertItem[] {
  const out: AlertItem[] = [];
  const seen = new Set<string>();

  // Offline / degraded cameras from health snapshot.
  for (const h of health) {
    if (h.status !== "offline" && h.status !== "degraded") continue;
    const cam = cameras.find((c) => c.id === h.camera_id);
    const id = `cam-health:${h.camera_id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      title: `Camera ${h.status} — ${cam?.name ?? h.camera_id}`,
      detail: `${h.camera_id} · last seen ${formatHM(h.last_seen)}`,
      severity: h.status === "offline" ? "critical" : "warning",
      timestamp: formatHM(h.last_checked || h.last_seen),
    });
  }

  // Critical events from the SSE buffer that aren't already represented by
  // the health snapshot above. Keeps the list interesting on a healthy
  // system where you'd otherwise see nothing.
  for (const ev of events) {
    if (ev.domain !== "camera" || ev.kind !== "health") continue;
    const status = (ev.data as { status?: string } | undefined)?.status;
    if (status !== "offline" && status !== "degraded") continue;
    const id = `event:${ev.id}`;
    const dedupe = `cam-health:${ev.entityId}`;
    if (seen.has(dedupe)) continue;
    seen.add(id);
    const cam = cameras.find((c) => c.id === ev.entityId);
    out.push({
      id,
      title: `Camera ${status} — ${cam?.name ?? ev.entityId}`,
      detail: ev.entityId,
      severity: status === "offline" ? "critical" : "warning",
      timestamp: formatHM(new Date(ev.receivedAt).toISOString()),
    });
  }

  return out.slice(0, 5);
}

function formatHM(rfc3339: string): string {
  if (!rfc3339) return "—";
  const d = new Date(rfc3339);
  if (isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function ActiveAlerts({ alerts }: { alerts: AlertItem[] }) {
  return (
    <section className="overflow-hidden rounded-card border border-border-subtle bg-canvas-raised">
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
        <p className="text-[14px] font-semibold text-text-primary">
          Active alerts
          <span className="ml-2 font-mono text-[11.5px] text-text-tertiary">{alerts.length}</span>
        </p>
        <Link
          to="/events"
          className="inline-flex items-center gap-1 font-mono text-[11px] text-text-tertiary hover:text-text-primary"
        >
          All events
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {alerts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
          <ShieldCheck className="h-6 w-6 text-status-online" />
          <p className="text-[13px] text-text-primary">No active alerts</p>
          <p className="font-mono text-[11px] text-text-tertiary">
            Cameras healthy, no critical events.
          </p>
        </div>
      ) : (
        <ul>
          {alerts.map((a, i) => (
            <AlertRow key={a.id} alert={a} withBorder={i > 0} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AlertRow({ alert, withBorder }: { alert: AlertItem; withBorder: boolean }) {
  const isCritical = alert.severity === "critical";
  const Icon = isCritical ? AlertTriangle : VideoOff;
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-5 py-3.5",
        withBorder && "border-t border-border-subtle"
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded",
          isCritical ? "bg-status-critical-subtle text-status-critical" : "bg-status-warning-subtle text-status-warning"
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-text-primary">{alert.title}</p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-text-tertiary">{alert.detail}</p>
      </div>
      <Badge
        variant={isCritical ? "critical" : "warning"}
        className="font-mono text-[10px] uppercase tracking-[0.06em]"
      >
        {alert.severity}
      </Badge>
      <span className="ml-1 w-[64px] flex-shrink-0 text-right font-mono text-[10.5px] tabular-nums text-text-tertiary">
        {alert.timestamp}
      </span>
    </li>
  );
}

// ─── Open incidents (stub) ────────────────────────────────────────────────────

function OpenIncidents() {
  // Backend has no incidents API yet (deferred per plan.md "NOT in V1").
  // Render a clear empty state explaining the deferral instead of fake rows.
  return (
    <section className="overflow-hidden rounded-card border border-border-subtle bg-canvas-raised">
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
        <p className="text-[14px] font-semibold text-text-primary">
          Open incidents
          <span className="ml-2 font-mono text-[11.5px] text-text-tertiary">0</span>
        </p>
      </div>
      <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface">
          <ShieldAlert className="h-4 w-4 text-text-tertiary" />
        </div>
        <p className="text-[13px] font-medium text-text-primary">No incidents API yet</p>
        <p className="max-w-[260px] font-mono text-[10.5px] text-text-tertiary">
          Incident management is on the post-V1 backlog. Critical events
          surface in the alerts list to the left for now.
        </p>
      </div>
    </section>
  );
}
