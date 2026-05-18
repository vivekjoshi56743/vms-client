import { Calendar } from "lucide-react";

import { cn } from "@/lib/cn";
import { fromLocalInputValue, toLocalInputValue } from "@/lib/time";

interface Props {
  /** RFC3339 UTC range start. */
  rangeStart: string;
  /** RFC3339 UTC range end. */
  rangeEnd: string;
  onChange: (start: string, end: string) => void;
}

const QUICK_RANGES: { label: string; hours: number }[] = [
  { label: "1h",  hours: 1 },
  { label: "6h",  hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d",  hours: 24 * 7 },
];

export function DateTimePicker({ rangeStart, rangeEnd, onChange }: Props) {
  const startVal = toLocalInputValue(new Date(rangeStart));
  const endVal = toLocalInputValue(new Date(rangeEnd));

  function setStart(v: string) {
    if (!v) return;
    onChange(fromLocalInputValue(v), rangeEnd);
  }
  function setEnd(v: string) {
    if (!v) return;
    onChange(rangeStart, fromLocalInputValue(v));
  }
  function applyQuickRange(hours: number) {
    const end = new Date();
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
    onChange(start.toISOString(), end.toISOString());
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DateField label="From" value={startVal} onChange={setStart} />
      <DateField label="To"   value={endVal}   onChange={setEnd} />

      <span className="mx-1 h-4 w-px bg-border" />

      <div className="flex items-center gap-1">
        {QUICK_RANGES.map((q) => (
          <button
            key={q.label}
            onClick={() => applyQuickRange(q.hours)}
            className={cn(
              "inline-flex h-7 items-center rounded-[3px] border border-border bg-surface px-2",
              "font-mono text-[11px] font-semibold uppercase tracking-[0.04em] text-text-secondary",
              "transition-colors duration-[120ms] hover:text-text-primary"
            )}
          >
            {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex h-7 items-center gap-1.5 rounded-[3px] border border-border bg-canvas-deep pl-2 pr-1">
      <Calendar className="h-3 w-3 text-text-tertiary" />
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-tertiary">
        {label}
      </span>
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-full bg-transparent font-mono text-[11.5px] text-text-primary outline-none",
          "[color-scheme:dark]"
        )}
      />
    </label>
  );
}
