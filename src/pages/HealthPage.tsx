import { AppShell } from "@/components/layout/AppShell";

export function HealthPage() {
  return (
    <AppShell title="Health">
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-3 inline-flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
            <span className="block h-px w-4 bg-text-tertiary" />
            Phase F10
          </div>
          <p className="text-[28px] font-bold tracking-tight text-text-primary">
            Health<span className="text-accent">.</span>
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            Per-camera health monitoring, poll 5 s — coming in Phase F10.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
