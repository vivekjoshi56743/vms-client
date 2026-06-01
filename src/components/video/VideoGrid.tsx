import { CameraOff } from "lucide-react";

import { cn } from "@/lib/cn";
import { VideoTile } from "@/components/video/VideoTile";
import type { PlayerState } from "@/components/video/VideoPlayer";
import type { GridSize } from "@/stores/layouts";
import type { Camera } from "@/api/cameras";
import type { CameraHealth } from "@/api/health";

interface StreamMap {
  [cameraId: string]: { webrtc: string | null; hls: string | null } | undefined;
}

interface HealthMap {
  [cameraId: string]: CameraHealth | undefined;
}

interface Props {
  size: GridSize;
  slots: (string | null)[];
  cameras: Camera[];
  streams: StreamMap;
  health: HealthMap;
  onSlotClick?: (slotIndex: number) => void;
  /** Bubbles each tile's player state up to the grid's parent — used by
   *  LivePage to aggregate "Connecting M/N streams" splash progress. */
  onTileStateChange?: (cameraId: string, state: PlayerState) => void;
  className?: string;
}

const GRID_COLS: Record<GridSize, string> = {
  "1x1": "grid-cols-1",
  "2x2": "grid-cols-2",
  "3x3": "grid-cols-3",
  "4x4": "grid-cols-4",
  "5x5": "grid-cols-5",
};

export function VideoGrid({ size, slots, cameras, streams, health, onSlotClick, onTileStateChange, className }: Props) {
  const cameraMap = Object.fromEntries(cameras.map((c) => [c.id, c]));

  return (
    <div className={cn("grid h-full gap-1", GRID_COLS[size], className)}>
      {slots.map((cameraId, i) => {
        if (!cameraId) {
          return (
            <EmptySlot
              key={i}
              index={i}
              onClick={onSlotClick ? () => onSlotClick(i) : undefined}
            />
          );
        }

        const camera = cameraMap[cameraId];
        if (!camera) {
          return <EmptySlot key={i} index={i} onClick={onSlotClick ? () => onSlotClick(i) : undefined} />;
        }

        const stream = streams[cameraId];
        const videoUrl = stream?.webrtc ?? stream?.hls ?? null;
        const hlsFallback = stream?.hls ?? null;
        const cameraHealth = health[cameraId];

        return (
          <VideoTile
            key={cameraId}
            camera={camera}
            url={videoUrl}
            hlsFallback={hlsFallback}
            health={cameraHealth}
            onStateChange={
              onTileStateChange ? (s) => onTileStateChange(cameraId, s) : undefined
            }
            className="h-full w-full"
          />
        );
      })}
    </div>
  );
}

function EmptySlot({
  index,
  onClick,
}: {
  index: number;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded bg-canvas-deep",
        "border border-dashed border-border text-text-disabled",
        "transition-colors duration-[120ms]",
        onClick
          ? "cursor-pointer hover:border-accent hover:text-accent"
          : "cursor-default"
      )}
      aria-label={`Slot ${index + 1} — click to assign camera`}
    >
      <CameraOff className="h-5 w-5" />
      {onClick && (
        <span className="font-mono text-[10px] uppercase tracking-[0.08em]">
          Assign
        </span>
      )}
    </button>
  );
}
