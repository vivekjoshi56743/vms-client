import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCurrentUser } from "@/hooks/useAuth";
import { useAuthStore } from "@/stores/auth";

export function DashboardPage() {
  const user = useCurrentUser();
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const expiresAt = useAuthStore((s) => s.expiresAt);

  return (
    <AppShell title="Dashboard">
      <div className="px-10 py-10">
        <div className="mb-3 inline-flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
          <span className="block h-px w-4 bg-accent" />
          Overview
        </div>
        <h1 className="mb-8 text-[32px] font-bold leading-none tracking-tight">
          Dashboard<span className="text-accent">.</span>
        </h1>

        <div className="grid max-w-[860px] grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Session</CardTitle>
              <CardDescription>Current server &amp; user.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 font-mono text-[12.5px]">
                <Row label="Server"   value={serverUrl ?? "—"} />
                <Row label="User"     value={user.data?.username ?? (user.isLoading ? "…" : "—")} />
                <Row label="Role"     value={user.data?.role ?? (user.isLoading ? "…" : "—")} />
                <Row label="Expires"  value={expiresAt ? new Date(expiresAt).toLocaleString() : "—"} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What&apos;s next</CardTitle>
              <CardDescription>Remaining phases.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm text-text-secondary">
                <li className="flex items-center gap-2">
                  <Badge variant="active">F6</Badge> Camera list + add / delete
                </li>
                <li className="flex items-center gap-2">
                  <Badge variant="offline">F7</Badge> Live view, single camera
                </li>
                <li className="flex items-center gap-2">
                  <Badge variant="offline">F8</Badge> Live grid (1×1 → 4×4)
                </li>
                <li className="flex items-center gap-2">
                  <Badge variant="offline">F9</Badge> Playback + timeline
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-[72px] flex-shrink-0 text-[10.5px] uppercase tracking-[0.1em] text-text-tertiary">
        {label}
      </dt>
      <dd className="break-all text-text-primary">{value}</dd>
    </div>
  );
}
