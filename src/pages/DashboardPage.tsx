import { LogOut } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCurrentUser, useLogout } from "@/hooks/useAuth";
import { useAuthStore } from "@/stores/auth";

// Placeholder dashboard — replaced by the real one in Phase F5/F6. Renders
// just enough to verify F4: a valid session lands here, /me is fetched, and
// logout sends the user back to /login.

export function DashboardPage() {
  const user = useCurrentUser();
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const expiresAt = useAuthStore((s) => s.expiresAt);
  const logout = useLogout();

  return (
    <div className="min-h-screen bg-canvas text-text-primary">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border-subtle bg-canvas/85 px-10 backdrop-blur">
        <div className="flex items-center gap-3 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
          <span className="relative inline-block h-[18px] w-[18px]">
            <span className="absolute inset-[3px] rounded-sm bg-accent" />
            <span className="absolute inset-0 rounded-sm border border-accent animate-brand-pulse" />
          </span>
          <span className="font-bold text-text-primary">SUPERVISION</span>
          <span className="text-text-tertiary">/</span>
          <span>DASHBOARD</span>
        </div>
        <div className="flex items-center gap-3">
          {user.data && (
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em] text-text-tertiary">
              <span>{user.data.username}</span>
              <Badge variant="active">{user.data.role}</Badge>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="px-14 py-16">
        <div className="mb-3 inline-flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
          <span className="block h-px w-4 bg-accent" />
          Phase F4
        </div>
        <h1 className="mb-4 text-[40px] font-bold leading-none tracking-tight">
          You're signed in<span className="text-accent">.</span>
        </h1>
        <p className="mb-10 max-w-[680px] text-[16px] leading-relaxed text-text-secondary">
          The full dashboard lands in Phase F5/F6. This screen exists to prove
          the auth flow end-to-end: TOFU trust on first connect, session
          persisted, page guarded, /me typed.
        </p>

        <div className="grid max-w-[800px] grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Session</CardTitle>
              <CardDescription>What the auth store knows about you.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 font-mono text-[12.5px]">
                <Row label="Server" value={serverUrl ?? "—"} />
                <Row
                  label="Expires"
                  value={
                    expiresAt
                      ? new Date(expiresAt).toLocaleString()
                      : "—"
                  }
                />
                <Row
                  label="User"
                  value={user.data?.username ?? (user.isLoading ? "…" : "—")}
                />
                <Row
                  label="Role"
                  value={user.data?.role ?? (user.isLoading ? "…" : "—")}
                />
                <Row
                  label="User ID"
                  value={user.data?.id ?? (user.isLoading ? "…" : "—")}
                />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What's next</CardTitle>
              <CardDescription>Phases that follow.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm text-text-secondary">
                <li>F5 — App shell (sidebar, topbar, navigation)</li>
                <li>F6 — Camera list + add / edit / delete</li>
                <li>F7 — Live view, single camera</li>
                <li>F8 — Live grid</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-[80px] flex-shrink-0 uppercase tracking-[0.1em] text-[10.5px] text-text-tertiary">
        {label}
      </dt>
      <dd className="break-all text-text-primary">{value}</dd>
    </div>
  );
}
