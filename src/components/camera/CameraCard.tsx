import { Trash2, Settings2 } from "lucide-react";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CameraHealthBadge } from "@/components/camera/CameraHealthBadge";
import type { Camera } from "@/api/cameras";
import type { CameraHealth } from "@/api/health";

interface Props {
  camera: Camera;
  health?: CameraHealth;
  onDelete: (camera: Camera) => void;
}

export function CameraCard({ camera, health, onDelete }: Props) {
  const status = health?.status ?? "unknown";

  return (
    <div
      className={cn(
        "group flex flex-col gap-3 rounded-card border bg-canvas-raised p-5",
        "transition-colors hover:border-border-strong hover:bg-surface",
        status === "offline" && "border-status-offline/30",
        status === "online"  && "border-status-online/20",
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-text-primary">
            {camera.name}
          </p>
          <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-text-tertiary">
            {camera.driver_type}
          </p>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Camera settings"
                disabled
              >
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Settings (Phase F6+)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Delete camera"
                className="hover:text-status-critical hover:bg-status-critical/10"
                onClick={() => onDelete(camera)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete camera</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* RTSP URL */}
      <p className="truncate rounded bg-canvas-deep px-2.5 py-1.5 font-mono text-[11.5px] text-text-secondary">
        {camera.rtsp_url || <span className="text-text-tertiary italic">No RTSP URL</span>}
      </p>

      {/* Footer row */}
      <div className="flex items-center justify-between gap-2">
        <CameraHealthBadge status={status} />

        <div className="flex items-center gap-3 font-mono text-[10.5px] text-text-tertiary">
          {camera.record_enabled && (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-status-critical animate-critical-pulse" />
              REC
            </span>
          )}
          {health?.last_seen && (
            <span title={health.last_seen}>
              {relativeTime(health.last_seen)}
            </span>
          )}
        </div>
      </div>

      {/* Error message */}
      {health?.last_error && status !== "online" && (
        <p className="rounded border border-status-critical/20 bg-status-critical-subtle px-2.5 py-1.5 font-mono text-[11px] text-status-critical">
          {health.last_error}
        </p>
      )}
    </div>
  );
}

function relativeTime(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - Date.parse(iso);
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
