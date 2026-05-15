import { useEffect, useState } from "react";
import { Plus, Monitor } from "lucide-react";

import { cn } from "@/lib/cn";
import { VideoGrid } from "@/components/video/VideoGrid";
import { useCameras, useAllCameraHealth } from "@/hooks/useCameras";
import { useStreams } from "@/hooks/useStream";
import { useLayoutsStore, type GridSize } from "@/stores/layouts";
import { useUIStore } from "@/stores/ui";
import type { Layout } from "@/stores/layouts";

const GRID_SIZES: GridSize[] = ["1x1", "2x2", "3x3", "4x4"];

// ─── LivePage ─────────────────────────────────────────────────────────────────

export function LivePage() {
  const cameras = useCameras();
  const health = useAllCameraHealth();
  const {
    layouts, activeId, setActive, setSize, setSlot, createLayout, ensureDefault,
  } = useLayoutsStore();
  const setTheme = useUIStore((s) => s.setTheme);
  const theme = useUIStore((s) => s.theme);

  // Seed default layout once cameras load
  useEffect(() => {
    if (cameras.data) ensureDefault(cameras.data.map((c) => c.id));
  }, [cameras.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeLayout = layouts.find((l) => l.id === activeId) ?? layouts[0] ?? null;

  // Collect all camera IDs in current layout and prefetch their streams
  const slotCameraIds = (activeLayout?.slots ?? []).filter(Boolean) as string[];
  const streams = useStreams(slotCameraIds);

  const healthMap = Object.fromEntries(
    (health.data ?? []).map((h) => [h.camera_id, h])
  );

  // Slot assignment popover state
  const [assigningSlot, setAssigningSlot] = useState<number | null>(null);

  function handleAssign(slotIndex: number, cameraId: string) {
    if (!activeLayout) return;
    setSlot(activeLayout.id, slotIndex, cameraId);
    setAssigningSlot(null);
  }

  const actions = (
    <div className="flex items-center gap-2">
      {/* Grid size selector */}
      {activeLayout && GRID_SIZES.map((s) => (
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

      {/* Surveillance mode toggle */}
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
        Surveillance
      </button>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-canvas text-text-primary">
      {/* Layouts panel */}
      <LayoutsPanel
        layouts={layouts}
        activeId={activeId}
        onSelect={setActive}
        onCreate={() => createLayout(`Layout ${layouts.length + 1}`, "2x2")}
      />

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Inner topbar for this page */}
        <div className="flex h-[52px] flex-shrink-0 items-center justify-between border-b border-border-subtle bg-canvas-raised px-4">
          <div className="flex items-center gap-3">
            {activeLayout && (
              <>
                <span className="text-[15px] font-semibold text-text-primary">
                  {activeLayout.name}
                </span>
                <span className="font-mono text-[11px] text-text-tertiary">
                  {activeLayout.size.replace("x", "×")} · {slotCameraIds.length} / {activeLayout.slots.length} cameras
                </span>
              </>
            )}
          </div>
          {actions}
        </div>

        {/* Grid */}
        <main className="flex-1 overflow-hidden p-1">
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
            <div className="flex h-full items-center justify-center text-text-tertiary">
              <p className="font-mono text-[12px] uppercase tracking-[0.08em]">
                No layout selected
              </p>
            </div>
          )}
        </main>

        {/* Footer */}
        {activeLayout && (
          <div className="flex h-9 flex-shrink-0 items-center justify-between border-t border-border-subtle px-4">
            <span className="font-mono text-[11px] text-text-tertiary">
              {slotCameraIds.length} of {activeLayout.slots.length} slots assigned
            </span>
          </div>
        )}
      </div>

      {/* Slot assignment popover */}
      {assigningSlot !== null && (
        <SlotAssignPopover
          cameras={cameras.data ?? []}
          onSelect={(id) => handleAssign(assigningSlot, id)}
          onDismiss={() => setAssigningSlot(null)}
        />
      )}
    </div>
  );
}

// ─── LayoutsPanel ─────────────────────────────────────────────────────────────

function LayoutsPanel({
  layouts,
  activeId,
  onSelect,
  onCreate,
}: {
  layouts: Layout[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}) {
  return (
    <aside className="flex w-[200px] flex-shrink-0 flex-col border-r border-border-subtle bg-canvas-raised">
      <div className="flex h-[52px] items-center justify-between border-b border-border-subtle px-4">
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
          Layouts
          {layouts.length > 0 && (
            <span className="ml-1.5 font-mono text-[10px] text-text-disabled">
              {layouts.length}
            </span>
          )}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {layouts.map((layout) => (
          <LayoutCard
            key={layout.id}
            layout={layout}
            active={layout.id === activeId}
            onClick={() => onSelect(layout.id)}
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
  onClick,
}: {
  layout: Layout;
  active: boolean;
  onClick: () => void;
}) {
  const cols = parseInt(layout.size[0]!);
  const filled = layout.slots.filter(Boolean).length;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full px-3 py-2.5 text-left transition-colors duration-[120ms]",
        active
          ? "bg-accent-subtle"
          : "hover:bg-surface"
      )}
    >
      {/* Mini grid preview */}
      <div
        className="mb-2 aspect-video w-full overflow-hidden rounded border border-border bg-canvas-deep"
        style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 1 }}
      >
        {layout.slots.map((id, i) => (
          <div
            key={i}
            className={cn(
              "rounded-[1px]",
              id ? "bg-surface-active" : "bg-canvas-deep"
            )}
          />
        ))}
      </div>

      <p className={cn("truncate text-[12.5px] font-medium", active ? "text-accent-text" : "text-text-primary")}>
        {layout.name}
        {active && <span className="ml-1.5 inline-block h-[6px] w-[6px] rounded-full bg-accent" />}
      </p>
      <p className="mt-0.5 font-mono text-[10px] text-text-tertiary">
        {layout.size.replace("x", "×")} · {filled} cameras
      </p>
    </button>
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
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-backdrop"
        onClick={onDismiss}
      />
      {/* Panel */}
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
                className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-text-primary transition-colors hover:bg-surface"
              >
                <span className="h-[6px] w-[6px] flex-shrink-0 rounded-full bg-status-online" />
                <span className="truncate font-mono text-[12px]">{cam.name}</span>
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
