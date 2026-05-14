import { AppShell } from "@/components/layout/AppShell";

export function SettingsPage() {
  return (
    <AppShell title="Settings">
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-3 inline-flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
            <span className="block h-px w-4 bg-text-tertiary" />
            Phase F11
          </div>
          <p className="text-[28px] font-bold tracking-tight text-text-primary">
            Settings<span className="text-accent">.</span>
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            User management, roles, TOTP — coming in Phase F11.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
