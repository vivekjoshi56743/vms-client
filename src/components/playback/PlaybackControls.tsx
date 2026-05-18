import { Pause, Play, SkipBack, SkipForward } from "lucide-react";

import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/time";
import { SPEEDS, type PlaybackSpeed } from "@/stores/playback";

interface Props {
  isPlaying: boolean;
  onPlayPause: () => void;
  /** Seek the scrubber by ±N seconds. */
  onSkip: (deltaSeconds: number) => void;
  speed: PlaybackSpeed;
  onSpeedChange: (speed: PlaybackSpeed) => void;
  /** Current scrubber offset (seconds since rangeStart). */
  currentSeconds: number;
  /** Total range length (seconds). */
  totalSeconds: number;
  disabled?: boolean;
}

const SKIP_SECONDS = 10;

export function PlaybackControls({
  isPlaying,
  onPlayPause,
  onSkip,
  speed,
  onSpeedChange,
  currentSeconds,
  totalSeconds,
  disabled,
}: Props) {
  return (
    <div
      className={cn(
        "flex h-12 items-center justify-between gap-3 border-t border-border-subtle bg-canvas-raised px-4",
        disabled && "opacity-50"
      )}
    >
      {/* Transport */}
      <div className="flex items-center gap-1">
        <ControlButton
          aria-label={`Back ${SKIP_SECONDS} seconds`}
          onClick={() => onSkip(-SKIP_SECONDS)}
          disabled={disabled}
        >
          <SkipBack className="h-3.5 w-3.5" />
        </ControlButton>

        <button
          onClick={onPlayPause}
          disabled={disabled}
          aria-label={isPlaying ? "Pause" : "Play"}
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-full",
            "bg-accent text-accent-on-accent transition-colors duration-[120ms]",
            "hover:bg-accent-bright focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            "disabled:cursor-not-allowed disabled:bg-surface disabled:text-text-disabled"
          )}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
        </button>

        <ControlButton
          aria-label={`Forward ${SKIP_SECONDS} seconds`}
          onClick={() => onSkip(SKIP_SECONDS)}
          disabled={disabled}
        >
          <SkipForward className="h-3.5 w-3.5" />
        </ControlButton>
      </div>

      {/* Time readout */}
      <div className="flex items-center gap-2 font-mono text-[12px] tabular-nums text-text-secondary">
        <span className="text-text-primary">{formatDuration(currentSeconds)}</span>
        <span className="text-text-disabled">/</span>
        <span>{formatDuration(totalSeconds)}</span>
      </div>

      {/* Speed */}
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-tertiary">
          Speed
        </span>
        <div className="flex items-center gap-0.5 rounded border border-border bg-canvas-deep p-0.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              disabled={disabled}
              className={cn(
                "inline-flex h-6 min-w-[34px] items-center justify-center rounded-[2px] px-1.5",
                "font-mono text-[10.5px] font-semibold tracking-[0.04em]",
                "transition-colors duration-[120ms]",
                speed === s
                  ? "bg-accent-subtle text-accent-text"
                  : "text-text-tertiary hover:bg-surface hover:text-text-primary",
                disabled && "cursor-not-allowed"
              )}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded text-text-secondary",
        "transition-colors duration-[120ms] hover:bg-surface hover:text-text-primary",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        "disabled:cursor-not-allowed disabled:text-text-disabled disabled:hover:bg-transparent"
      )}
    >
      {children}
    </button>
  );
}
