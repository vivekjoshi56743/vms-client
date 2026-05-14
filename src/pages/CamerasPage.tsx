import { useState } from "react";
import { Plus } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { CameraCard } from "@/components/camera/CameraCard";
import { AddCameraDialog } from "@/components/camera/AddCameraDialog";
import { DeleteCameraDialog } from "@/components/camera/DeleteCameraDialog";
import { useCameras, useAllCameraHealth } from "@/hooks/useCameras";
import type { Camera } from "@/api/cameras";

export function CamerasPage() {
  const cameras = useCameras();
  const health = useAllCameraHealth();

  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Camera | null>(null);

  // Build a map from camera_id → health so CameraCard gets O(1) lookup.
  const healthMap = Object.fromEntries(
    (health.data ?? []).map((h) => [h.camera_id, h])
  );

  const actions = (
    <Button variant="accent" size="sm" onClick={() => setAddOpen(true)}>
      <Plus className="h-4 w-4" />
      Add camera
    </Button>
  );

  return (
    <AppShell title="Cameras" actions={actions}>
      <div className="px-10 py-10">
        <div className="mb-3 inline-flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
          <span className="block h-px w-4 bg-accent" />
          Camera management
        </div>
        <div className="mb-8 flex items-end justify-between">
          <h1 className="text-[32px] font-bold leading-none tracking-tight">
            Cameras<span className="text-accent">.</span>
          </h1>
          {cameras.data && cameras.data.length > 0 && (
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-tertiary">
              {cameras.data.length} camera{cameras.data.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Loading */}
        {cameras.isLoading && <CameraListSkeleton />}

        {/* Error */}
        {cameras.error && (
          <div className="rounded-card border border-status-critical/30 bg-status-critical-subtle px-5 py-4">
            <p className="font-mono text-[12px] text-status-critical">
              {cameras.error instanceof Error ? cameras.error.message : "Failed to load cameras"}
            </p>
          </div>
        )}

        {/* Empty state */}
        {cameras.data && cameras.data.length === 0 && (
          <EmptyState onAdd={() => setAddOpen(true)} />
        )}

        {/* Camera grid */}
        {cameras.data && cameras.data.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cameras.data.map((camera) => (
              <CameraCard
                key={camera.id}
                camera={camera}
                health={healthMap[camera.id]}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </div>

      <AddCameraDialog open={addOpen} onOpenChange={setAddOpen} />
      <DeleteCameraDialog
        camera={deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      />
    </AppShell>
  );
}

function CameraListSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-[152px] animate-shimmer rounded-card border border-border bg-canvas-raised"
        />
      ))}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border py-20 text-center">
      <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full border border-border bg-surface">
        <span className="font-mono text-[22px] font-bold text-text-tertiary">
          0
        </span>
      </div>
      <p className="mb-1 text-[16px] font-semibold text-text-primary">
        No cameras yet
      </p>
      <p className="mb-6 max-w-[320px] text-sm text-text-secondary">
        Connect your first RTSP camera to start monitoring. You&apos;ll need the
        RTSP stream URL and optional credentials.
      </p>
      <Button variant="accent" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        Add your first camera
      </Button>
    </div>
  );
}
