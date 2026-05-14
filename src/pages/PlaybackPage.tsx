import { AppShell } from "@/components/layout/AppShell";

export function PlaybackPage() {
  return (
    <AppShell title="Playback">
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-3 inline-flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
            <span className="block h-px w-4 bg-text-tertiary" />
            Phase F9
          </div>
          <p className="text-[28px] font-bold tracking-tight text-text-primary">
            Playback<span className="text-accent">.</span>
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            Recording timeline + fMP4 scrubber — coming in Phase F9.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
