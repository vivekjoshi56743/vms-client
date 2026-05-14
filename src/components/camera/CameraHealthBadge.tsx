import { cn } from "@/lib/cn";
import type { HealthStatus } from "@/api/health";

interface Props {
  status: HealthStatus;
  /** Show a text label alongside the dot. Default true. */
  label?: boolean;
  className?: string;
}

const STATUS_CONFIG: Record<
  HealthStatus,
  { dot: string; glow?: string; text: string; label: string }
> = {
  online:   { dot: "bg-status-online",   glow: "0 0 8px var(--status-online-glow)",   text: "text-status-online",   label: "Online"   },
  degraded: { dot: "bg-status-warning",  glow: undefined,                              text: "text-status-warning",  label: "Degraded" },
  offline:  { dot: "bg-status-offline",  glow: undefined,                              text: "text-status-offline",  label: "Offline"  },
  unknown:  { dot: "bg-status-offline",  glow: undefined,                              text: "text-text-tertiary",   label: "Unknown"  },
};

export function CameraHealthBadge({ status, label = true, className }: Props) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn("h-[7px] w-[7px] flex-shrink-0 rounded-full", cfg.dot,
          status === "online" && "animate-[live-breathe_2.4s_ease-in-out_infinite]"
        )}
        style={cfg.glow ? { boxShadow: cfg.glow } : undefined}
      />
      {label && (
        <span className={cn("font-mono text-[11px] font-semibold uppercase tracking-[0.1em]", cfg.text)}>
          {cfg.label}
        </span>
      )}
    </span>
  );
}
