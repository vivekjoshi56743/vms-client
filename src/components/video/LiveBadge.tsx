import { cn } from "@/lib/cn";

interface Props {
  className?: string;
}

// The "LIVE" pill shown on active streams — uses the live-breathe animation
// from animations.css and video-chrome tokens for legibility over video.
export function LiveBadge({ className }: Props) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2 py-0.5",
        "bg-[var(--video-chrome-bg)] backdrop-blur-sm",
        className
      )}
    >
      <span
        className="h-[7px] w-[7px] flex-shrink-0 rounded-full bg-status-critical"
        style={{
          boxShadow: "0 0 6px var(--status-critical-glow)",
          animation: "live-breathe 2.4s ease-in-out infinite",
        }}
      />
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-white">
        Live
      </span>
    </div>
  );
}
