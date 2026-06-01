import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Monitor, X, Camera, VideoOff, Search, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/cn";
import { AppShell } from "@/components/layout/AppShell";
import { VideoGrid } from "@/components/video/VideoGrid";
import type { PlayerState } from "@/components/video/VideoPlayer";
import { useCameras, useAllCameraHealth } from "@/hooks/useCameras";
import { useStreams } from "@/hooks/useStream";
import { ensureStream } from "@/api/streams";
import { useLayoutsStore, type GridSize, type Layout } from "@/stores/layouts";
import { useUIStore } from "@/stores/ui";
import { openSurveillanceWindow } from "@/lib/surveillance-window";

const GRID_SIZES: GridSize[] = ["1x1", "2x2", "3x3", "4x4", "5x5"];

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

  // URL params: ?surveillance=1&layout=<id>
  // Set by openSurveillanceWindow when spawning a dedicated surveillance
  // window. Activates the requested layout and flips theme to surveillance
  // once, on mount, so the user doesn't have to click anything.
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const layoutId = searchParams.get("layout");
    const wantsSurveillance = searchParams.get("surveillance") === "1";
    if (layoutId && layouts.find((l) => l.id === layoutId)) {
      setActive(layoutId);
    }
    if (wantsSurveillance && theme !== "dark-surveillance") {
      setTheme("dark-surveillance");
    }
    // Only react to params once on mount + when layouts hydrate from
    // localStorage in the new window. Theme is intentionally not a dep —
    // we don't want to bounce back into surveillance after the user exits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, layouts.length]);

  const activeLayout = layouts.find((l) => l.id === activeId) ?? layouts[0] ?? null;
  const slotCameraIds = (activeLayout?.slots ?? []).filter(Boolean) as string[];
  const streams = useStreams(slotCameraIds);
  const healthMap = Object.fromEntries((health.data ?? []).map((h) => [h.camera_id, h]));

  // Prefetch stream URLs for every known camera as soon as the camera list
  // resolves. POST /api/cameras/:id/stream is the slowest single step in
  // bringing up a tile — running it in the background here means by the
  // time the user switches layouts or grid sizes the URLs are already
  // cached. staleTime is Infinity on the useStream queries so prefetched
  // entries never go stale within the session.
  const queryClient = useQueryClient();
  const prefetchedRef = useRef(false);
  useEffect(() => {
    if (prefetchedRef.current) return;
    if (!cameras.data || cameras.data.length === 0) return;
    prefetchedRef.current = true;
    for (const cam of cameras.data) {
      void queryClient.prefetchQuery({
        queryKey: ["stream", cam.id],
        queryFn:  () => ensureStream(cam.id),
        staleTime: Infinity,
      });
    }
  }, [cameras.data, queryClient]);

  // Per-tile playback state, keyed by camera id. Driven by VideoGrid's
  // onTileStateChange callback. Used to render the "Connecting M/N streams"
  // splash and to know when to fade it out.
  const [tileStates, setTileStates] = useState<Record<string, PlayerState>>({});
  const handleTileStateChange = (cameraId: string, state: PlayerState) =>
    setTileStates((prev) => (prev[cameraId] === state ? prev : { ...prev, [cameraId]: state }));

  // Reset tile-state tracking whenever the layout's slot set changes — old
  // entries for cameras no longer in the grid would otherwise pollute the
  // count.
  useEffect(() => {
    setTileStates((prev) => {
      const keep: Record<string, PlayerState> = {};
      for (const id of slotCameraIds) if (prev[id]) keep[id] = prev[id]!;
      return keep;
    });
  }, [slotCameraIds.join("|")]);

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

              <div className="relative flex-1 overflow-hidden p-1">
                {activeLayout ? (
                  <>
                    <VideoGrid
                      size={activeLayout.size}
                      slots={activeLayout.slots}
                      cameras={cameras.data ?? []}
                      streams={streams}
                      health={healthMap}
                      onSlotClick={setAssigningSlot}
                      onTileStateChange={handleTileStateChange}
                      className="h-full"
                    />
                    <ConnectingSplash
                      slotCameraIds={slotCameraIds}
                      tileStates={tileStates}
                      healthMap={healthMap}
                    />
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-text-tertiary">
                      No layout — create one from the panel
                    </p>
                  </div>
                )}
              </div>

              {activeLayout && (
                <PaginationFooter
                  filledSlots={slotCameraIds.length}
                  totalSlots={activeLayout.slots.length}
                  totalCameras={cameras.data?.length ?? 0}
                />
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

// ─── Connecting splash ────────────────────────────────────────────────────────
// Aggregate progress overlay shown over the video grid while the first wave
// of tiles is still handshaking. Fades out when every "expected to play"
// tile has reached `playing` state, or after a hard fallback timeout so a
// single broken camera doesn't keep the splash up forever.
//
// "Expected to play" excludes cameras whose health is offline/degraded —
// those will surface their own per-tile offline overlay; counting them
// would prevent the splash from ever clearing on a partially-down system.

// Minimum time the splash stays up, even if every stream connects faster
// than that. On a healthy LAN tiles can reach `playing` in <200 ms, which
// makes the splash flash and disappear — worse than not showing it at all.
// Two seconds is long enough to register visually without being annoying.
const SPLASH_MIN_MS = 2_000;
// Hard ceiling — a single broken camera can't pin the splash up indefinitely.
const SPLASH_FALLBACK_MS = 8_000;

function ConnectingSplash({
  slotCameraIds,
  tileStates,
  healthMap,
}: {
  slotCameraIds: string[];
  tileStates: Record<string, PlayerState>;
  healthMap: Record<string, { status: string } | undefined>;
}) {
  // Reset both timers whenever the camera set changes (layout switch, slot
  // assignment, etc.) so the splash re-runs its full lifecycle for the new
  // tiles.
  const [minElapsed, setMinElapsed] = useState(false);
  const [fallbackElapsed, setFallbackElapsed] = useState(false);
  useEffect(() => {
    setMinElapsed(false);
    setFallbackElapsed(false);
    const minId = setTimeout(() => setMinElapsed(true), SPLASH_MIN_MS);
    const maxId = setTimeout(() => setFallbackElapsed(true), SPLASH_FALLBACK_MS);
    return () => {
      clearTimeout(minId);
      clearTimeout(maxId);
    };
  }, [slotCameraIds.join("|")]);

  const expected = slotCameraIds.filter(
    (id) => healthMap[id]?.status !== "offline"
  );
  const playing = expected.filter((id) => tileStates[id] === "playing").length;
  const total = expected.length;

  // Hide rules:
  //   • No expected tiles at all (nothing's coming) → hide immediately.
  //   • Every expected tile is playing AND the 2 s minimum has elapsed.
  //   • Fallback ceiling hit (8 s) → hide regardless.
  const allPlaying = playing >= total;
  const hidden =
    total === 0 || (allPlaying && minElapsed) || fallbackElapsed;

  return (
    <div
      aria-hidden={hidden}
      className={cn(
        "pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden",
        "transition-opacity duration-500",
        hidden ? "opacity-0" : "opacity-100"
      )}
      style={{
        // Opaque dark surface with the mockup's dot-grid + ambient cyan glow.
        // Layers, painted back-to-front:
        //   1. Solid canvas-deep — fully opaque so video tiles never show through.
        //   2. Radial cyan wash centered on the splash.
        //   3. 32px dot-grid pattern in --grid tone.
        backgroundColor: "var(--canvas-deep)",
        backgroundImage:
          "radial-gradient(ellipse at 50% 45%, rgba(34,211,238,0.10) 0%, transparent 55%)," +
          "radial-gradient(circle at 1px 1px, var(--grid) 1px, transparent 0)",
        backgroundSize: "auto, 32px 32px",
      }}
    >
      {/* Ambient pulsing glow ring */}
      <span
        className="pointer-events-none absolute h-[440px] w-[440px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(34,211,238,0.10) 0%, transparent 60%)",
          animation: "splash-glow 4s ease-in-out infinite alternate",
        }}
      />

      <div className="relative z-10 flex max-w-sm flex-col items-center gap-5 px-6 text-center">
        {/* Eyebrow with horizontal dashes — matches mockup .splash-tip */}
        <div className="flex items-center gap-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent">
          <span className="block h-px w-7 bg-accent/40" />
          Establishing live feeds
          <span className="block h-px w-7 bg-accent/40" />
        </div>

        {/* Big M/N counter */}
        <div className="font-mono text-[44px] font-semibold leading-none tabular-nums">
          <span className="text-accent" style={{ textShadow: "0 0 18px var(--accent-glow)" }}>
            {playing}
          </span>
          <span className="mx-3 text-text-disabled">/</span>
          <span className="text-text-primary">{total}</span>
        </div>

        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-text-tertiary">
          Connecting streams
        </span>

        {/* Progress bar with cyan glow */}
        <div className="h-[2px] w-[280px] overflow-hidden rounded-full bg-surface">
          <div
            className="h-full transition-[width] duration-300"
            style={{
              width: total > 0 ? `${(playing / total) * 100}%` : "0%",
              background: "linear-gradient(90deg, var(--accent), var(--accent-bright))",
              boxShadow: "0 0 12px var(--accent-glow)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Pagination footer ────────────────────────────────────────────────────────
// Shows "Page X of Y · M-N of T cameras" and the prev/next controls. For V1
// we don't yet paginate across pages (a layout can hold at most 25 cameras
// in 5×5 mode), so this is mostly a placeholder that already wires the
// keyboard shortcut hints from the mockup. The "F watch" hint corresponds
// to the F key entering surveillance mode in the mockup — non-functional
// here, just visual parity with the mockup.

function PaginationFooter({
  filledSlots,
  totalSlots,
  totalCameras,
}: {
  filledSlots: number;
  totalSlots: number;
  totalCameras: number;
}) {
  const shown = Math.min(filledSlots, totalCameras);
  return (
    <div className="flex h-9 flex-shrink-0 items-center justify-between border-t border-border-subtle bg-canvas-raised px-4">
      <span className="font-mono text-[10.5px] text-text-tertiary">
        Page <span className="text-text-secondary">1</span> of{" "}
        <span className="text-text-secondary">1</span>
        <span className="mx-2 text-text-disabled">·</span>
        <span className="text-text-secondary">1-{shown}</span> of{" "}
        <span className="text-text-secondary">{totalCameras}</span> cameras
        {totalSlots > totalCameras && (
          <span className="ml-2 text-text-disabled">
            ({totalSlots - filledSlots} empty slot{totalSlots - filledSlots !== 1 ? "s" : ""})
          </span>
        )}
      </span>
      <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-text-tertiary">
        <button
          aria-label="Previous page"
          disabled
          className="inline-flex h-6 w-6 items-center justify-center rounded text-text-disabled disabled:opacity-40"
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <span className="h-3 w-px bg-border" />
        <button
          aria-label="Next page"
          disabled
          className="inline-flex h-6 w-6 items-center justify-center rounded text-text-disabled disabled:opacity-40"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
        <span className="ml-3 inline-flex items-center gap-1.5">
          <kbd className="rounded border border-border bg-surface px-1 text-[9.5px]">←</kbd>
          <kbd className="rounded border border-border bg-surface px-1 text-[9.5px]">→</kbd>
          <span>page</span>
        </span>
        <span className="mx-1 text-text-disabled">·</span>
        <span className="inline-flex items-center gap-1.5">
          <kbd className="rounded border border-border bg-surface px-1 text-[9.5px]">F</kbd>
          <span>watch</span>
        </span>
      </div>
    </div>
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
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return layouts;
    return layouts.filter((l) => l.name.toLowerCase().includes(q));
  }, [layouts, query]);

  return (
    <aside className="flex w-[228px] flex-shrink-0 flex-col border-r border-border-subtle bg-canvas-raised">
      <div className="flex h-[52px] items-center justify-between border-b border-border-subtle px-4">
        <span className="text-[14px] font-semibold text-text-primary">
          Layouts
        </span>
        {layouts.length > 0 && (
          <span className="font-mono text-[10.5px] text-text-tertiary">
            {layouts.length}
          </span>
        )}
      </div>

      {/* Search */}
      <div className="border-b border-border-subtle px-3 py-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-text-tertiary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search layouts…"
            className="h-7 w-full rounded border border-border bg-surface-input pl-6 pr-2 font-mono text-[11px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent"
          />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {visible.length === 0 && query !== "" && (
          <p className="px-4 py-3 font-mono text-[10.5px] text-text-tertiary">
            No layouts match.
          </p>
        )}
        {visible.map((layout) => (
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

      {/* "Open in new Surveillance window" button — bottom-right of the
          card's preview, hover-reveal. Spawns a separate Tauri webview
          window with ?surveillance=1&layout=<id>. */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          void openSurveillanceWindow(layout.id);
        }}
        aria-label="Open in new Surveillance window"
        title="Open in new Surveillance window"
        className={cn(
          "absolute bottom-12 right-2 inline-flex h-6 w-6 items-center justify-center rounded border bg-canvas-deep/90 backdrop-blur transition-all duration-[120ms]",
          "border-border text-text-tertiary opacity-0 group-hover:opacity-100",
          "hover:border-accent hover:text-accent"
        )}
      >
        <Monitor className="h-3 w-3" />
      </button>
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
