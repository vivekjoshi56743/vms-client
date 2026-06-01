import { cn } from "@/lib/cn";
import { PlaybackTile } from "@/components/playback/PlaybackTile";

interface CameraRef {
  id: string;
  name: string;
}

interface Props {
  cameras: CameraRef[];
  className?: string;
}

// Tile grid that adapts to camera count:
//   1 camera   → single tile
//   2 cameras  → side-by-side 2-up
//   3 cameras  → 2 over 1 (3-up via 2×2 with one slot empty)
//   4 cameras  → 2×2
//   5–6        → 3×2
//   7–9        → 3×3
//   10–12      → 4×3
//   13+        → 4×4 (later cameras paginate)
function gridClassFor(n: number): string {
  if (n <= 1) return "grid grid-cols-1 grid-rows-1";
  if (n <= 2) return "grid grid-cols-2 grid-rows-1";
  if (n <= 4) return "grid grid-cols-2 grid-rows-2";
  if (n <= 6) return "grid grid-cols-3 grid-rows-2";
  if (n <= 9) return "grid grid-cols-3 grid-rows-3";
  if (n <= 12) return "grid grid-cols-4 grid-rows-3";
  return "grid grid-cols-4 grid-rows-4";
}

export function PlaybackTileGrid({ cameras, className }: Props) {
  if (cameras.length === 0) {
    return null;
  }
  return (
    <div className={cn(gridClassFor(cameras.length), "h-full w-full gap-1", className)}>
      {cameras.slice(0, 16).map((c) => (
        <PlaybackTile key={c.id} cameraId={c.id} cameraName={c.name} />
      ))}
    </div>
  );
}
