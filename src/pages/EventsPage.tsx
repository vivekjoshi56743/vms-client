import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import {
  Bell,
  Camera as CameraIcon,
  Film,
  Activity,
  AlertTriangle,
  Trash2,
  RadioTower,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { useCameras } from "@/hooks/useCameras";
import { useEventsStore, type EventLogItem } from "@/stores/events";

type FilterKey = "all" | "camera" | "recording";

export function EventsPage() {
  const items = useEventsStore((s) => s.items);
  const markAllRead = useEventsStore((s) => s.markAllRead);
  const clear = useEventsStore((s) => s.clear);
  const cameras = useCameras();

  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");

  // Mark unread → 0 once the user lands on this page.
  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  const cameraNameById = useMemo(
    () => new Map((cameras.data ?? []).map((c) => [c.id, c.name])),
    [cameras.data]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filter !== "all" && it.domain !== filter) return false;
      if (!q) return true;
      const name = cameraNameById.get(it.entityId)?.toLowerCase() ?? "";
      return (
        it.topic.toLowerCase().includes(q) ||
        it.entityId.toLowerCase().includes(q) ||
        name.includes(q)
      );
    });
  }, [items, filter, search, cameraNameById]);

  return (
    <AppShell title="Events">
      <div className="px-10 py-10">
        <div className="mb-3 inline-flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
          <span className="block h-px w-4 bg-accent" />
          Live event stream
        </div>
        <div className="mb-6 flex items-end justify-between">
          <h1 className="text-[32px] font-bold leading-none tracking-tight">
            Events<span className="text-accent">.</span>
          </h1>
          <div className="flex items-center gap-2">
            <LiveIndicator />
            {items.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clear}>
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Filter pills + search */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex gap-1.5">
            <FilterPill active={filter === "all"} onClick={() => setFilter("all")}>
              All <span className="ml-1.5 font-mono text-[10px] opacity-60">{items.length}</span>
            </FilterPill>
            <FilterPill active={filter === "camera"} onClick={() => setFilter("camera")}>
              <CameraIcon className="h-3 w-3" />
              Cameras
            </FilterPill>
            <FilterPill active={filter === "recording"} onClick={() => setFilter("recording")}>
              <Film className="h-3 w-3" />
              Recordings
            </FilterPill>
          </div>
          <Input
            placeholder="Search topic or camera name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>

        {/* List / empty state */}
        {items.length === 0 ? (
          <EmptyState />
        ) : visible.length === 0 ? (
          <div className="rounded-card border border-dashed border-border bg-canvas-raised px-5 py-8 text-center">
            <p className="text-[13px] text-text-secondary">No events match those filters.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-card border border-border-subtle bg-canvas-raised">
            {visible.map((item, i) => (
              <EventRow
                key={item.id}
                item={item}
                cameraName={cameraNameById.get(item.entityId)}
                withBorder={i > 0}
              />
            ))}
          </div>
        )}

        <p className="mt-6 font-mono text-[11px] text-text-tertiary">
          Showing in-session events only. The backend doesn&apos;t expose an event
          history endpoint — events from before this session aren&apos;t included
          and a reload clears the list.
        </p>
      </div>
    </AppShell>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function EventRow({
  item,
  cameraName,
  withBorder,
}: {
  item: EventLogItem;
  cameraName: string | undefined;
  withBorder: boolean;
}) {
  const { icon: Icon, color, summary, severity } = describe(item, cameraName);
  return (
    <div
      className={cn(
        "flex items-start gap-4 px-5 py-3.5",
        withBorder && "border-t border-border-subtle"
      )}
    >
      <div
        className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
        style={{
          background: `var(--${color}-subtle, var(--surface))`,
          color: `var(--${color}, var(--text-tertiary))`,
        }}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[13px] font-medium text-text-primary">{summary}</p>
          {severity && (
            <Badge
              variant={severity === "critical" ? "critical" : severity === "warning" ? "warning" : "active"}
              className="font-mono text-[9.5px] uppercase tracking-[0.08em]"
            >
              {severity}
            </Badge>
          )}
        </div>
        <p className="mt-1 font-mono text-[10.5px] text-text-tertiary">
          {item.topic}
        </p>
      </div>
      <div
        className="flex-shrink-0 text-right font-mono text-[10.5px] text-text-tertiary"
        title={format(new Date(item.receivedAt), "PPpp")}
      >
        {formatDistanceToNow(new Date(item.receivedAt), { addSuffix: true })}
      </div>
    </div>
  );
}

// Map an event to a human-readable summary + icon + severity.
function describe(
  item: EventLogItem,
  cameraName: string | undefined
): {
  icon: React.ComponentType<{ className?: string }>;
  color: string;            // CSS var prefix, e.g. "status-critical"
  summary: string;
  severity: "info" | "warning" | "critical" | null;
} {
  const who = cameraName ?? item.entityId;

  if (item.domain === "camera" && item.kind === "health") {
    const status = (item.data as { status?: string } | undefined)?.status;
    if (status === "offline") {
      return {
        icon: AlertTriangle,
        color: "status-critical",
        summary: `Camera "${who}" went offline`,
        severity: "critical",
      };
    }
    if (status === "degraded") {
      return {
        icon: AlertTriangle,
        color: "status-warning",
        summary: `Camera "${who}" is degraded`,
        severity: "warning",
      };
    }
    if (status === "online") {
      return {
        icon: Activity,
        color: "status-online",
        summary: `Camera "${who}" is back online`,
        severity: "info",
      };
    }
    return {
      icon: Activity,
      color: "accent",
      summary: `Camera "${who}" health changed`,
      severity: null,
    };
  }

  if (item.domain === "camera" && item.kind === "stream") {
    return {
      icon: CameraIcon,
      color: "accent",
      summary: `Stream ${item.state} on camera "${who}"`,
      severity: null,
    };
  }

  if (item.domain === "recording" && item.kind === "segment") {
    return {
      icon: Film,
      color: "accent",
      summary: `Recording segment ${item.state}`,
      severity: null,
    };
  }

  return {
    icon: Bell,
    color: "text-tertiary",
    summary: item.topic,
    severity: null,
  };
}

// ─── Bits ────────────────────────────────────────────────────────────────────

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-[3px] px-2.5 font-mono text-[11px] font-semibold tracking-[0.05em] transition-colors duration-120",
        active
          ? "bg-accent-subtle text-accent-text"
          : "border border-border bg-surface text-text-secondary hover:text-text-primary"
      )}
    >
      {children}
    </button>
  );
}

function LiveIndicator() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-status-online/30 bg-status-online-subtle px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-status-online">
      <span
        className="h-1.5 w-1.5 rounded-full bg-status-online"
        style={{ animation: "live-breathe 2.4s ease-in-out infinite" }}
      />
      <RadioTower className="h-3 w-3" />
      Listening
    </span>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-canvas-raised py-16 text-center">
      <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full border border-border bg-surface">
        <Bell className="h-6 w-6 text-text-tertiary" />
      </div>
      <p className="text-[16px] font-semibold text-text-primary">
        Waiting for events
      </p>
      <p className="mt-1 max-w-sm text-[13px] text-text-secondary">
        Connected to the live stream. New events from cameras and recordings
        will appear here as they happen.
      </p>
    </div>
  );
}
