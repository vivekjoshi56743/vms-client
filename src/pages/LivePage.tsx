import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Monitor, X, Camera, VideoOff } from "lucide-react";

import { cn } from "@/lib/cn";
import { AppShell } from "@/components/layout/AppShell";
import { VideoGrid } from "@/components/video/VideoGrid";
import { useCameras, useAllCameraHealth } from "@/hooks/useCameras";
import { useStreams } from "@/hooks/useStream";
import { useLayoutsStore, type GridSize, type Layout } from "@/stores/layouts";
import { useUIStore } from "@/stores/ui";

const GRID_SIZES: GridSize[] = ["1x1", "2x2", "3x3", "4x4"];

// ─── LivePage ─────────────────────────────────────────────────────────────────

export function LivePage() {
  const cameras = useCameras();
  const health = useAllCameraHealth();
  const {
    layouts, activeId, setActive, setSize, setSlot,
    createLayout, deleteLayout, ensureDefault,
  } = useLayoutsStore();
  const setTheme = useUIStore((s) => s.setTheme);
  const theme = useUIStore((s) => s.theme);

  // Seed default layout once cameras load
  useEffect(() => {
    if (cameras.data) ensureDefault(cameras.data.map((c) => c.id));
  }, [cameras.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeLayout = layouts.find((l) => l.id === activeId) ?? layouts[0] ?? null;
  const slotCameraIds = (activeLayout?.slots ?? []).filter(Boolean) as string[];
  const streams = useStreams(slotCameraIds);
  const healthMap = Object.fromEntries((health.data ?? []).map((h) => [h.camera_id, h]));

  const [assigningSlot, setAssigningSlot] = useState<number | null>(null);

  function handleAssign(slotIndex: number, cameraId: string) {
    if (!activeLayout) return;
    setSlot(activeLayout.id, slotIndex, cameraId);
    setAssigningSlot(null);
  }

  // Grid size + surveillance controls rendered in the inner sub-header
  const subHeader = activeLayout ? (
    <div className="flex h-[44px] flex-shrink-0 items-center justify-between border-b border-border-subtle bg-canvas-raised px-4">
      <div className="flex items-center gap-3">
        <span className="text-[14px] font-semibold text-text-primary">{activeLayout.name}</span>
        <span className="font-mono text-[10.5px] text-text-tertiary">
          {activeLayout.size.replace("x", "×")} · {slotCameraIds.length}/{activeLayout.slots.length} cameras
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {GRID_SIZES.map((s) => (
          <button
            key={s}
            onClick={() => setSize(activeLayout.id, s)}
            className={cn(
              "inline-flex h-6 items-center rounded-[3px] px-2.5 font-mono text-[11px] font-semibold tracking-[0.05em] transition-colors duration-[120ms]",
              activeLayout.size === s
                ? "bg-accent-subtle text-accent-text"
                : "border border-border bg-surface text-text-secondary hover:text-text-primary"
            )}
          >
            {s.replace("x", "×")}
          </button>
        ))}
        <div className="mx-1 h-4 w-px bg-border" />
        <button
          onClick={() => setTheme(theme === "dark-surveillance" ? "dark-standard" : "dark-surveillance")}
          className={cn(
            "inline-flex h-6 items-center gap-1.5 rounded-[3px] px-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.05em] transition-colors duration-[120ms]",
            theme === "dark-surveillance"
              ? "bg-accent text-accent-on-accent"
              : "border border-border bg-surface text-text-secondary hover:text-text-primary"
          )}
        >
          <Monitor className="h-3 w-3" />
          {theme === "dark-surveillance" ? "Exit" : "Surveillance"}
        </button>
      </div>
    </div>
  ) : null;

  const noCameras = !cameras.isLoading && (cameras.data?.length ?? 0) === 0;

  return (
    <AppShell mainClassName="overflow-hidden">
      {/* Content area: layouts panel + main */}
      <div className="flex h-full overflow-hidden">

        {/* Layouts panel */}
        <LayoutsPanel
          layouts={layouts}
          activeId={activeId}
          onSelect={setActive}
          onDelete={deleteLayout}
          onCreate={() => createLayout(`Layout ${layouts.length + 1}`, "2x2")}
        />

        {/* Right: sub-header + grid */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {cameras.isLoading ? (
            <LiveLoadingSkeleton />
          ) : noCameras ? (
            <NoCamerasEmpty />
          ) : (
            <>
              {subHeader}

              <div className="flex-1 overflow-hidden p-1">
                {activeLayout ? (
                  <VideoGrid
                    size={activeLayout.size}
                    slots={activeLayout.slots}
                    cameras={cameras.data ?? []}
                    streams={streams}
                    health={healthMap}
                    onSlotClick={setAssigningSlot}
                    className="h-full"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-text-tertiary">
                      No layout — create one from the panel
                    </p>
                  </div>
                )}
              </div>

              {activeLayout && (
                <div className="flex h-8 flex-shrink-0 items-center border-t border-border-subtle px-4">
                  <span className="font-mono text-[11px] text-text-tertiary">
                    {slotCameraIds.length} of {activeLayout.slots.length} slots assigned
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Slot assignment popover */}
      {assigningSlot !== null && (
        <SlotAssignPopover
          cameras={cameras.data ?? []}
          onSelect={(id) => handleAssign(assigningSlot, id)}
          onDismiss={() => setAssigningSlot(null)}
        />
      )}
    </AppShell>
  );
}

// ─── Loading + empty states ───────────────────────────────────────────────────

function LiveLoadingSkeleton() {
  return (
    <>
      <div className="flex h-[44px] flex-shrink-0 items-center justify-between border-b border-border-subtle bg-canvas-raised px-4">
        <div className="flex items-center gap-3">
          <span className="h-3.5 w-28 animate-shimmer rounded bg-surface-active" />
          <span className="h-2.5 w-20 animate-shimmer rounded bg-surface-active" />
        </div>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="h-6 w-10 animate-shimmer rounded-[3px] bg-surface-active" />
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-hidden p-1">
        <div className="grid h-full grid-cols-2 gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-shimmer rounded-[3px] bg-surface-active" />
          ))}
        </div>
      </div>
    </>
  );
}

function NoCamerasEmpty() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-border bg-surface">
          <VideoOff className="h-6 w-6 text-text-tertiary" />
        </div>
        <div>
          <p className="text-[16px] font-semibold text-text-primary">
            No cameras to view yet
          </p>
          <p className="mt-1 text-[13px] text-text-secondary">
            Add a camera first — once it's online you can drop it into a
            layout slot here.
          </p>
        </div>
        <Link
          to="/cameras"
          className="inline-flex items-center gap-1.5 rounded border border-accent bg-accent px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-accent-on-accent hover:bg-accent-bright"
        >
          <Camera className="h-3.5 w-3.5" />
          Add a camera
        </Link>
      </div>
    </div>
  );
}

// ─── LayoutsPanel ─────────────────────────────────────────────────────────────

function LayoutsPanel({
  layouts,
  activeId,
  onSelect,
  onDelete,
  onCreate,
}: {
  layouts: Layout[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <aside className="flex w-[188px] flex-shrink-0 flex-col border-r border-border-subtle bg-canvas-raised">
      <div className="flex h-[44px] items-center border-b border-border-subtle px-4">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
          Layouts
          {layouts.length > 0 && (
            <span className="ml-1.5 text-text-disabled">{layouts.length}</span>
          )}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {layouts.map((layout) => (
          <LayoutCard
            key={layout.id}
            layout={layout}
            active={layout.id === activeId}
            canDelete={layouts.length > 1}
            onClick={() => onSelect(layout.id)}
            onDelete={() => onDelete(layout.id)}
          />
        ))}
      </div>

      <div className="border-t border-border-subtle p-2">
        <button
          onClick={onCreate}
          className="flex w-full items-center justify-center gap-1.5 rounded py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary transition-colors duration-[120ms] hover:bg-surface hover:text-text-primary"
        >
          <Plus className="h-3.5 w-3.5" />
          New Layout
        </button>
      </div>
    </aside>
  );
}

function LayoutCard({
  layout,
  active,
  canDelete,
  onClick,
  onDelete,
}: {
  layout: Layout;
  active: boolean;
  canDelete: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const cols = parseInt(layout.size[0]!);
  const filled = layout.slots.filter(Boolean).length;

  return (
    <div
      className={cn(
        "group relative px-3 py-2.5 transition-colors duration-[120ms]",
        active ? "bg-accent-subtle" : "hover:bg-surface"
      )}
    >
      <button onClick={onClick} className="w-full text-left">
        {/* Mini grid preview */}
        <div
          className="mb-2 aspect-video w-full overflow-hidden rounded border border-border bg-canvas-deep"
          style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 1 }}
        >
          {layout.slots.map((id, i) => (
            <div
              key={i}
              className={cn("rounded-[1px]", id ? "bg-surface-active" : "bg-canvas-deep")}
            />
          ))}
        </div>

        <p className={cn("truncate text-[12.5px] font-medium", active ? "text-accent-text" : "text-text-primary")}>
          {layout.name}
          {active && (
            <span className="ml-1.5 inline-block h-[6px] w-[6px] rounded-full bg-accent" />
          )}
        </p>
        <p className="mt-0.5 font-mono text-[10px] text-text-tertiary">
          {layout.size.replace("x", "×")} · {filled} cameras
        </p>
      </button>

      {/* Delete button — hover-reveal, hidden for last layout */}
      {canDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label="Delete layout"
          className={cn(
            "absolute right-2 top-2 rounded p-1 transition-all duration-[120ms]",
            "text-text-disabled opacity-0 group-hover:opacity-100",
            "hover:bg-status-critical-subtle hover:text-status-critical"
          )}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ─── SlotAssignPopover ────────────────────────────────────────────────────────

function SlotAssignPopover({
  cameras,
  onSelect,
  onDismiss,
}: {
  cameras: { id: string; name: string }[];
  onSelect: (id: string) => void;
  onDismiss: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-backdrop" onClick={onDismiss} />
      <div className="fixed left-1/2 top-1/2 z-50 w-72 -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-canvas-overlay shadow-xl">
        <div className="border-b border-border px-4 py-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
            Assign camera to slot
          </p>
        </div>
        <ul className="max-h-64 overflow-y-auto py-1">
          {cameras.map((cam) => (
            <li key={cam.id}>
              <button
                onClick={() => onSelect(cam.id)}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-surface"
              >
                <span className="h-[6px] w-[6px] flex-shrink-0 rounded-full bg-status-online" />
                <span className="truncate font-mono text-[12px] text-text-primary">{cam.name}</span>
              </button>
            </li>
          ))}
          {cameras.length === 0 && (
            <li className="px-4 py-3 font-mono text-[11px] text-text-tertiary">
              No cameras available
            </li>
          )}
        </ul>
        <div className="border-t border-border px-4 py-2">
          <button
            onClick={onDismiss}
            className="w-full rounded py-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-text-tertiary hover:text-text-primary"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
