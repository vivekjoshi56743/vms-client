import { Search, Trash2, Plus, MoreHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUIStore, type Theme } from "@/stores/ui";

// Phase F1/F2 verification target. If everything looks right here, the design
// system foundation is correct (plan.md §F1, §F2 done-conditions).

const themeOrder: Theme[] = ["light", "dark-standard", "dark-surveillance"];
function nextTheme(t: Theme): Theme {
  return themeOrder[(themeOrder.indexOf(t) + 1) % themeOrder.length]!;
}

function Section({
  num,
  eyebrow,
  title,
  children,
}: {
  num: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border-subtle px-14 py-16">
      <div className="mb-8">
        <div className="flex items-baseline gap-6">
          <span className="font-mono text-[64px] font-light leading-none tracking-tight text-text-tertiary">
            {num}
          </span>
          <div className="flex-1">
            <div className="mb-3 inline-flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
              <span className="block h-px w-4 bg-accent" />
              {eyebrow}
            </div>
            <h2 className="text-[40px] font-bold leading-none tracking-tight text-text-primary">
              {title}
              <span className="text-accent">.</span>
            </h2>
          </div>
        </div>
      </div>
      {children}
    </section>
  );
}

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-canvas-raised p-6">
      <div className="mb-4 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
        {label}
        <span className="h-px flex-1 bg-border-subtle" />
      </div>
      {children}
    </div>
  );
}

export function Playground() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  return (
    <div className="min-h-screen text-text-primary">
      {/* Topbar */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border-subtle bg-canvas/85 px-10 backdrop-blur">
        <div className="flex items-center gap-3 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-text-tertiary">
          <span className="relative inline-block h-[18px] w-[18px]">
            <span className="absolute inset-[3px] bg-accent rounded-sm" />
            <span className="absolute inset-0 border border-accent rounded-sm animate-brand-pulse" />
          </span>
          <span className="text-text-primary font-bold">SUPERVISION</span>
          <span className="text-text-tertiary">/</span>
          <span>PLAYGROUND</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-text-tertiary">
            Theme
          </span>
          <Button variant="secondary" size="sm" onClick={() => setTheme(nextTheme(theme))}>
            <span className="font-mono text-[11px] uppercase tracking-[0.1em]">
              {theme}
            </span>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="px-14 py-20">
        <div className="mb-3 inline-flex items-center gap-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
          <span className="block h-px w-4 bg-accent" />
          Design system smoke test
        </div>
        <h1 className="mb-4 text-[56px] font-bold leading-none tracking-tight">
          Supervision<span className="text-accent">.</span>
        </h1>
        <p className="max-w-[680px] text-[17px] leading-relaxed text-text-secondary">
          Every value below resolves through the CSS variables in{" "}
          <span className="font-mono text-accent-text">tokens.css</span>. Cycle the
          theme in the top right; everything should re-skin coherently across
          light, dark-standard, and dark-surveillance.
        </p>
      </section>

      <Section num="01" eyebrow="Buttons" title="Variants & sizes">
        <Frame label="Variants — default size">
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="primary">Primary</Button>
            <Button variant="accent">
              <Plus className="h-4 w-4" />
              Accent
            </Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">
              <Trash2 className="h-4 w-4" />
              Danger
            </Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </div>
        </Frame>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <Frame label="Sizes">
            <div className="flex flex-wrap items-center gap-4">
              <Button variant="primary" size="sm">
                Small
              </Button>
              <Button variant="primary">Default</Button>
              <Button variant="primary" size="lg">
                Large
              </Button>
            </div>
          </Frame>
          <Frame label="Icon-only">
            <div className="flex flex-wrap items-center gap-4">
              <Button variant="secondary" size="icon-sm" aria-label="More">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
              <Button variant="secondary" size="icon" aria-label="More">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
              <Button variant="secondary" size="icon-lg" aria-label="More">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
              <Button variant="accent" size="icon" aria-label="Add">
                <Plus className="h-4 w-4" />
              </Button>
              <Button variant="danger" size="icon" aria-label="Delete">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Frame>
        </div>
      </Section>

      <Section num="02" eyebrow="Forms" title="Inputs & labels">
        <div className="grid grid-cols-2 gap-4">
          <Frame label="Default state">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pg-default">Camera name</Label>
              <Input id="pg-default" placeholder="Front door" />
            </div>
          </Frame>
          <Frame label="With autofocus (focused state)">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pg-focus">RTSP URL</Label>
              <Input
                id="pg-focus"
                placeholder="rtsp://192.168.1.42:554/stream1"
                autoFocus
              />
            </div>
          </Frame>
          <Frame label="Error state">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pg-error">Username</Label>
              <Input id="pg-error" defaultValue="" aria-invalid="true" />
              <p className="font-mono text-xs text-status-critical">
                Required
              </p>
            </div>
          </Frame>
          <Frame label="Disabled">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pg-disabled">Read-only</Label>
              <Input
                id="pg-disabled"
                defaultValue="cam-b0b392098f5754acf95a144effdd060c"
                disabled
              />
            </div>
          </Frame>
          <Frame label="Mono variant (technical text)">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pg-mono">Camera ID</Label>
              <Input
                id="pg-mono"
                defaultValue="cam-b0b392098f5754acf95a144effdd060c"
                className="font-mono tabular-nums"
              />
            </div>
          </Frame>
          <Frame label="With leading icon">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pg-icon">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                <Input id="pg-icon" placeholder="Filter cameras…" className="pl-9" />
              </div>
            </div>
          </Frame>
        </div>
      </Section>

      <Section num="03" eyebrow="Surfaces" title="Cards">
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Default card</CardTitle>
              <CardDescription>
                canvas-raised over border-subtle, 6px radius.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-text-secondary">
                Cards hold focused information without competing with the canvas
                grid texture.
              </p>
            </CardContent>
          </Card>

          <Card className="p-6">
            <CardTitle className="mb-2">Comfortable padding</CardTitle>
            <p className="text-sm text-text-secondary">
              Uses the larger 24px gutter for more breathing room around dense
              content like camera details or settings.
            </p>
          </Card>

          <Card className="border-accent bg-[color-mix(in_srgb,var(--accent-subtle)_30%,var(--canvas-raised))]">
            <CardHeader>
              <CardTitle>Selected card</CardTitle>
              <CardDescription>
                Accent-tinted to mark the active selection.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-text-secondary">
                Used in the camera list when a tile is the current focus.
              </p>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section num="04" eyebrow="Status" title="Badges">
        <Frame label="Status pills">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="online">ONLINE</Badge>
            <Badge variant="warning">DEGRADED</Badge>
            <Badge variant="critical">CRITICAL</Badge>
            <Badge variant="offline">OFFLINE</Badge>
            <Badge variant="active">RECORDING</Badge>
          </div>
        </Frame>

        <div className="mt-4">
          <Frame label="Status dots (free-form composition)">
            <div className="flex flex-wrap items-center gap-6 text-sm">
              <span className="inline-flex items-center gap-2 text-status-online">
                <span
                  className="h-[7px] w-[7px] rounded-full bg-current"
                  style={{ boxShadow: "0 0 8px var(--status-online-glow)" }}
                />
                <span className="text-text-primary font-medium">Online</span>
              </span>
              <span className="inline-flex items-center gap-2 text-status-warning">
                <span className="h-[7px] w-[7px] rounded-full bg-current" />
                <span className="text-text-primary font-medium">Warning</span>
              </span>
              <span className="inline-flex items-center gap-2 text-status-critical">
                <span
                  className="h-[7px] w-[7px] rounded-full bg-current animate-critical-pulse"
                  style={{ boxShadow: "0 0 10px var(--status-critical-glow)" }}
                />
                <span className="text-text-primary font-medium">Critical</span>
              </span>
              <span className="inline-flex items-center gap-2 text-status-offline">
                <span className="h-[7px] w-[7px] rounded-full bg-current" />
                <span className="text-text-primary font-medium">Offline</span>
              </span>
            </div>
          </Frame>
        </div>
      </Section>

      <Section num="05" eyebrow="Typography" title="Inter & JetBrains Mono">
        <div className="grid grid-cols-2 gap-4">
          <Frame label="Inter — UI text">
            <div className="space-y-3">
              <p className="text-[40px] font-semibold leading-tight tracking-tight">
                Display
              </p>
              <p className="text-[28px] font-semibold tracking-tight">Title</p>
              <p className="text-[22px] font-semibold">Heading 1</p>
              <p className="text-base">Body — sustains 25fps total</p>
              <p className="text-sm text-text-secondary">Body small</p>
            </div>
          </Frame>
          <Frame label="JetBrains Mono — technical text">
            <div className="space-y-3 font-mono">
              <p className="text-[20px]">2026-05-14 14:32:08</p>
              <p className="text-sm">cam-b0b392098f5754acf95a144effdd060c</p>
              <p className="text-sm">rtsp://192.168.1.42:554/stream1</p>
              <p className="text-[11px] uppercase tracking-[0.1em] text-text-tertiary">
                ENCODER · H.264 · 1920×1080 · 30FPS
              </p>
            </div>
          </Frame>
        </div>
      </Section>

      {/* Footer system bar */}
      <footer className="fixed bottom-0 left-0 right-0 z-50 flex h-7 items-center justify-between bg-ink px-5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-text-inverse">
        <div className="flex items-center gap-4">
          <span className="opacity-50">THEME</span>
          <span>{theme}</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="h-1.5 w-1.5 rounded-full bg-accent-bright"
            style={{ boxShadow: "0 0 6px var(--accent-glow)" }}
          />
          <span>READY</span>
        </div>
      </footer>
    </div>
  );
}
