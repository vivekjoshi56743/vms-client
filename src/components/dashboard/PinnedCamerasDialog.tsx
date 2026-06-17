import { Pin } from "lucide-react";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCameras, useAllCameraHealth } from "@/hooks/useCameras";
import { usePinnedStore, PINNED_LIMIT } from "@/stores/pinned";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PinnedCamerasDialog({ open, onOpenChange }: Props) {
  const cameras = useCameras();
  const health = useAllCameraHealth();
  const savedIds = usePinnedStore((s) => s.ids);
  const toggle = usePinnedStore((s) => s.toggle);
  const clear = usePinnedStore((s) => s.clear);

  const healthById = new Map((health.data ?? []).map((h) => [h.camera_id, h.status]));

  // Only count pins that exist on the *current* server. Stale IDs left over
  // from a different server would otherwise inflate the count past the cap
  // and disable every checkbox, making it impossible to pin anything here.
  const cameraIds = new Set((cameras.data ?? []).map((c) => c.id));
  const pinnedIds = savedIds.filter((id) => cameraIds.has(id));
  const atCap = pinnedIds.length >= PINNED_LIMIT;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent">
            Edit pinned cameras
          </div>
          <DialogTitle>
            Pin up to {PINNED_LIMIT} cameras
          </DialogTitle>
          <DialogDescription>
            Pinned cameras appear at the top of the Home page. Saved on this
            device — the backend doesn&apos;t store pin selection yet.
          </DialogDescription>
        </DialogHeader>

        {/* Count + clear */}
        <div className="flex items-center justify-between px-6 py-2">
          <span className="font-mono text-[11px] text-text-tertiary">
            <span className="text-text-primary">{pinnedIds.length}</span>
            <span> / {PINNED_LIMIT} pinned</span>
          </span>
          {pinnedIds.length > 0 && (
            <button
              onClick={clear}
              className="font-mono text-[11px] text-status-critical hover:underline"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Camera list */}
        <ul className="max-h-72 overflow-y-auto px-3 pb-2">
          {(cameras.data ?? []).map((cam) => {
            const checked = pinnedIds.includes(cam.id);
            const status = healthById.get(cam.id) ?? "unknown";
            const disabled = !checked && atCap;
            return (
              <li key={cam.id}>
                <button
                  onClick={() => toggle(cam.id)}
                  disabled={disabled}
                  title={disabled ? `At ${PINNED_LIMIT} pinned — unpin one first` : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded px-3 py-2 text-left transition-colors",
                    checked
                      ? "bg-accent-subtle text-accent-text"
                      : "hover:bg-surface text-text-primary",
                    disabled && "opacity-40 cursor-not-allowed hover:bg-transparent"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-[2px] border",
                      checked
                        ? "border-accent bg-accent text-accent-on-accent"
                        : "border-border bg-canvas-deep"
                    )}
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
                  <span className="flex-1 truncate font-mono text-[12px]">
                    {cam.name}
                  </span>
                  {checked && (
                    <Pin className="h-3 w-3 flex-shrink-0 text-accent" />
                  )}
                </button>
              </li>
            );
          })}
          {(cameras.data ?? []).length === 0 && (
            <li className="px-3 py-4 font-mono text-[11px] text-text-tertiary">
              No cameras configured.
            </li>
          )}
        </ul>

        <DialogFooter>
          <Button variant="accent" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
