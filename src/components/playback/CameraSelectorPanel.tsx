import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@/lib/cn";
import { useCameras, useAllCameraHealth } from "@/hooks/useCameras";
import { usePlaybackStore } from "@/stores/playback";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/time";
import type { Camera } from "@/api/cameras";

interface Props {
  className?: string;
}

// Left rail of the Playback page.
//   • Header: "Cameras N of M in session"
//   • Calendar: pick a day; sets the playback range to that day's 00:00–24:00 local
//   • Time range: HH:MM:SS pair, optional refinement
//   • Camera list: grouped by location prefix (everything before the first '_'),
//     multi-select with checkboxes
//
// Range writes go to the playback store. The cameras list mirrors the store's
// cameraIds[].

export function CameraSelectorPanel({ className }: Props) {
  const cameras = useCameras();
  const health = useAllCameraHealth();
  const cameraIds = usePlaybackStore((s) => s.cameraIds);
  const toggleCamera = usePlaybackStore((s) => s.toggleCamera);
  const rangeStart = usePlaybackStore((s) => s.rangeStart);
  const rangeEnd = usePlaybackStore((s) => s.rangeEnd);
  const setRange = usePlaybackStore((s) => s.setRange);

  const totalCameras = cameras.data?.length ?? 0;
  const healthById = useMemo(
    () => new Map((health.data ?? []).map((h) => [h.camera_id, h.status])),
    [health.data]
  );

  // Group cameras by name prefix (everything before the first underscore).
  // Falls back to "ALL" if no underscore.
  const groups = useMemo(() => {
    const m = new Map<string, Camera[]>();
    for (const cam of cameras.data ?? []) {
      const prefix = cam.name.includes("_") ? cam.name.split("_")[0]!.toUpperCase() : "ALL";
      if (!m.has(prefix)) m.set(prefix, []);
      m.get(prefix)!.push(cam);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [cameras.data]);

  return (
    <aside className={cn("flex flex-col border-r border-border-subtle bg-canvas-raised", className)}>
      {/* Header */}
      <div className="flex h-[52px] flex-shrink-0 items-center justify-between border-b border-border-subtle px-4">
        <span className="text-[14px] font-semibold text-text-primary">Cameras</span>
        <span className="font-mono text-[10.5px] text-text-tertiary">
          {cameraIds.length} of {totalCameras} in session
        </span>
      </div>

      {/* Body: scrollable */}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
        {/* Calendar */}
        <CalendarSection rangeStart={rangeStart} setRange={setRange} />

        {/* Time range */}
        <TimeRangeSection rangeStart={rangeStart} rangeEnd={rangeEnd} setRange={setRange} />

        {/* Camera groups */}
        <section className="flex flex-col gap-4">
          {cameras.isLoading ? (
            <CameraGroupSkeleton />
          ) : groups.length === 0 ? (
            <p className="font-mono text-[11px] text-text-tertiary">
              No cameras configured.
            </p>
          ) : (
            groups.map(([prefix, group]) => (
              <div key={prefix} className="flex flex-col gap-1.5">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
                  {prefix}
                </p>
                <ul className="flex flex-col gap-px">
                  {group.map((cam) => {
                    const checked = cameraIds.includes(cam.id);
                    const status = healthById.get(cam.id) ?? "unknown";
                    return (
                      <li key={cam.id}>
                        <button
                          onClick={() => toggleCamera(cam.id)}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded px-2 py-1.5 transition-colors",
                            checked
                              ? "bg-accent-subtle text-accent-text"
                              : "hover:bg-surface text-text-primary"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-[2px] border",
                              checked
                                ? "border-accent bg-accent text-accent-on-accent"
                                : "border-border bg-canvas-deep"
                            )}
                            aria-hidden
                          >
                            {checked && (
                              <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                <path d="M2.5 6.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          <span
                            className={cn(
                              "h-1.5 w-1.5 flex-shrink-0 rounded-full",
                              status === "online"
                                ? "bg-status-online"
                                : status === "offline"
                                  ? "bg-status-critical"
                                  : "bg-status-offline"
                            )}
                          />
                          <span className="truncate font-mono text-[11.5px] text-left">
                            {cam.name}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </section>
      </div>
    </aside>
  );
}

// ─── Calendar ────────────────────────────────────────────────────────────────

function CalendarSection({
  rangeStart,
  setRange,
}: {
  rangeStart: string | null;
  setRange: (start: string, end: string) => void;
}) {
  const selectedDay = useMemo(() => (rangeStart ? new Date(rangeStart) : new Date()), [rangeStart]);

  // Calendar always shows the month of the selected day.
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date(selectedDay);
    d.setDate(1);
    return d;
  });

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  function pick(day: Date) {
    // Day playback range = local 00:00 to 24:00 of the picked day.
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);
    setRange(start.toISOString(), end.toISOString());
  }

  const monthLabel = viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const firstWeekday = (new Date(viewMonth).setDate(1), new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay());
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = [
    ...Array.from({ length: firstWeekday }, () => null as Date | null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1)),
  ];

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[11.5px] font-semibold text-text-primary">
          {monthLabel}
        </span>
        <div className="flex gap-1">
          <button
            aria-label="Previous month"
            onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-surface hover:text-text-primary"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <button
            aria-label="Next month"
            onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-text-tertiary hover:bg-surface hover:text-text-primary"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="mb-1 grid grid-cols-7 gap-px">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="text-center font-mono text-[10px] uppercase text-text-tertiary">
            {d}
          </span>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-px">
        {cells.map((day, i) => {
          if (!day) return <span key={i} />;
          const isSel = sameDay(day, selectedDay);
          const isFuture = day > today;
          return (
            <button
              key={i}
              onClick={() => !isFuture && pick(day)}
              disabled={isFuture}
              className={cn(
                "flex aspect-square items-center justify-center rounded-[3px] font-mono text-[11px] transition-colors",
                isSel
                  ? "bg-accent text-accent-on-accent font-semibold"
                  : isFuture
                    ? "text-text-disabled"
                    : "text-text-primary hover:bg-surface"
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      <p className="mt-2 font-mono text-[10px] text-text-tertiary">
        Click a day to load its recordings.
      </p>
    </section>
  );
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ─── Time range ──────────────────────────────────────────────────────────────
// Full From → To datetime range (can span days), with quick-range presets.
// The calendar above is for "give me this whole day"; this section lets the
// user dial in any precise range, including multi-day spans.

const QUICK_RANGES: { label: string; hours: number }[] = [
  { label: "1h",  hours: 1 },
  { label: "6h",  hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d",  hours: 24 * 7 },
];

function TimeRangeSection({
  rangeStart,
  rangeEnd,
  setRange,
}: {
  rangeStart: string | null;
  rangeEnd: string | null;
  setRange: (start: string, end: string) => void;
}) {
  const startVal = rangeStart ? toLocalInputValue(new Date(rangeStart)) : "";
  const endVal = rangeEnd ? toLocalInputValue(new Date(rangeEnd)) : "";

  function setStart(v: string) {
    if (!v || !rangeEnd) return;
    setRange(fromLocalInputValue(v), rangeEnd);
  }
  function setEnd(v: string) {
    if (!v || !rangeStart) return;
    setRange(rangeStart, fromLocalInputValue(v));
  }
  function applyQuick(hours: number) {
    const end = new Date();
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
    setRange(start.toISOString(), end.toISOString());
  }

  return (
    <section>
      <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
        Time range
      </p>
      <div className="flex flex-col gap-1.5">
        <DateTimeField label="From" value={startVal} onChange={setStart} />
        <DateTimeField label="To"   value={endVal}   onChange={setEnd} />
      </div>

      {/* Quick presets */}
      <div className="mt-2.5 flex flex-wrap gap-1">
        {QUICK_RANGES.map((q) => (
          <button
            key={q.label}
            onClick={() => applyQuick(q.hours)}
            className={cn(
              "inline-flex h-6 items-center rounded-[3px] border border-border bg-surface px-2",
              "font-mono text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-secondary",
              "transition-colors hover:text-text-primary hover:border-border-strong"
            )}
          >
            Last {q.label}
          </button>
        ))}
      </div>

      <p className="mt-2.5 font-mono text-[10px] text-text-tertiary">
        Pick a single day above, or set a custom multi-day range here.
      </p>
    </section>
  );
}

function DateTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex h-8 w-full items-center gap-2 rounded border border-border bg-canvas-deep px-2">
      <CalendarIcon className="h-3 w-3 flex-shrink-0 text-text-tertiary" />
      <span className="w-[28px] font-mono text-[10px] uppercase tracking-[0.1em] text-text-tertiary">
        {label}
      </span>
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "min-w-0 flex-1 bg-transparent font-mono text-[11px] text-text-primary outline-none",
          "[color-scheme:dark]"
        )}
      />
    </label>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function CameraGroupSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[1, 2].map((g) => (
        <div key={g} className="flex flex-col gap-1.5">
          <span className="block h-2.5 w-16 animate-shimmer rounded bg-surface-active" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2.5 px-2 py-1.5">
              <span className="h-3.5 w-3.5 animate-shimmer rounded-[2px] bg-surface-active" />
              <span className="h-1.5 w-1.5 animate-shimmer rounded-full bg-surface-active" />
              <span className="block h-3 w-32 animate-shimmer rounded bg-surface-active" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
