import { Sun, Moon, Cctv, Search, Bell, Camera, ChevronDown } from "lucide-react";

import { cn } from "@/lib/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUIStore, type Theme } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";
import { useAllCameraHealth } from "@/hooks/useCameras";

const THEMES: { value: Theme; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "light",             label: "Light",        icon: Sun  },
  { value: "dark-standard",     label: "Dark",         icon: Moon },
  { value: "dark-surveillance", label: "Surveillance", icon: Cctv },
];

interface TopBarProps {
  title?: string;
  actions?: React.ReactNode;
}

export function TopBar({ title, actions }: TopBarProps) {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const user = useAuthStore((s) => s.user);
  const health = useAllCameraHealth();

  const offlineCount =
    health.data?.filter((h) => h.status === "offline" || h.status === "degraded").length ?? 0;

  const currentTheme = THEMES.find((t) => t.value === theme) ?? THEMES[1]!;
  const ThemeIcon = currentTheme.icon;

  // User initials for avatar
  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "??";

  return (
    <header className="flex h-[52px] flex-shrink-0 items-center justify-between border-b border-border-subtle bg-canvas-raised px-4">
      {/* Left: page title / action slot from page */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {title && (
          <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
            {title}
          </span>
        )}
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>

      {/* Center: search bar (stub — no backend search in V1) */}
      <div className="relative mx-4 hidden w-[300px] max-w-[40vw] lg:block">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
        <input
          type="text"
          placeholder="Search cameras, events…"
          readOnly
          className={cn(
            "h-8 w-full cursor-default rounded border border-border bg-surface-input",
            "pl-8 pr-10 font-sans text-[13px] text-text-tertiary",
            "focus:outline-none"
          )}
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-[18px] items-center rounded border border-border bg-surface px-1.5 font-mono text-[10px] text-text-tertiary">
          ⌘K
        </kbd>
      </div>

      {/* Right: status + controls */}
      <div className="flex flex-shrink-0 items-center gap-1.5">
        {/* Camera offline pill — only shown when cameras are down */}
        {offlineCount > 0 && (
          <div className="inline-flex items-center gap-1.5 rounded border border-status-critical/30 bg-status-critical-subtle px-2.5 py-1 font-mono text-[11px] font-semibold text-status-critical">
            <Camera className="h-3.5 w-3.5" />
            {offlineCount} down
          </div>
        )}

        {/* Theme toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Switch theme"
              className="inline-flex h-8 w-8 items-center justify-center rounded text-text-tertiary transition-colors duration-120 hover:bg-surface hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ThemeIcon className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {THEMES.map(({ value, label, icon: TIcon }) => (
              <DropdownMenuItem
                key={value}
                onClick={() => setTheme(value)}
                className={cn(
                  "gap-2 font-mono text-[12px] uppercase tracking-[0.08em]",
                  theme === value && "text-accent"
                )}
              >
                <TIcon className="h-3.5 w-3.5" />
                {label}
                {theme === value && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications (stub) */}
        <button
          aria-label="Notifications"
          className="inline-flex h-8 w-8 items-center justify-center rounded text-text-tertiary transition-colors duration-120 hover:bg-surface hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Bell className="h-4 w-4" />
        </button>

        {/* User pill */}
        <div className="inline-flex h-8 cursor-default items-center gap-2 rounded px-2 transition-colors duration-120 hover:bg-surface">
          {/* Avatar circle */}
          <span
            className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold text-accent-on-accent"
            style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-active))" }}
          >
            {initials}
          </span>
          {user?.username && (
            <span className="hidden text-[13px] font-medium text-text-primary sm:block">
              {user.username}
            </span>
          )}
          <ChevronDown className="h-3 w-3 text-text-tertiary" />
        </div>
      </div>
    </header>
  );
}
