// Time helpers for playback + timeline rendering.

/** seconds → "HH:MM:SS" (zero-padded). */
export function formatDuration(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/** RFC3339 → local "YYYY-MM-DD HH:MM:SS" for display. */
export function formatLocal(rfc3339: string): string {
  if (!rfc3339) return "";
  const d = new Date(rfc3339);
  if (isNaN(d.getTime())) return rfc3339;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** RFC3339 → local "HH:MM" for compact timeline labels. */
export function formatLocalHM(rfc3339: string): string {
  if (!rfc3339) return "";
  const d = new Date(rfc3339);
  if (isNaN(d.getTime())) return rfc3339;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Local-time <input type="datetime-local"> value (YYYY-MM-DDTHH:MM) for a Date. */
export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:MM" (local) → RFC3339 UTC string. */
export function fromLocalInputValue(v: string): string {
  // new Date() interprets the value as local time when there's no timezone.
  return new Date(v).toISOString();
}

/** Range duration in seconds; 0 if invalid. */
export function rangeSeconds(startRFC: string, endRFC: string): number {
  const s = Date.parse(startRFC);
  const e = Date.parse(endRFC);
  if (isNaN(s) || isNaN(e) || e <= s) return 0;
  return (e - s) / 1000;
}
