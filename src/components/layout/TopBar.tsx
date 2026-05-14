import { Sun, Moon, Cctv } from "lucide-react";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUIStore, type Theme } from "@/stores/ui";

const THEMES: { value: Theme; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "light",             label: "Light",       icon: Sun  },
  { value: "dark-standard",     label: "Dark",        icon: Moon },
  { value: "dark-surveillance", label: "Surveillance", icon: Cctv },
];

interface TopBarProps {
  /** Page title shown in the breadcrumb slot. */
  title?: string;
  /** Optional actions rendered in the right slot (e.g. Add button). */
  actions?: React.ReactNode;
}

export function TopBar({ title, actions }: TopBarProps) {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  const currentTheme = THEMES.find((t) => t.value === theme) ?? THEMES[1]!;
  const Icon = currentTheme.icon;

  return (
    <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-border-subtle bg-canvas/85 px-6 backdrop-blur">
      {/* Left: page title */}
      <div className="flex items-center gap-3">
        {title && (
          <>
            <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
              {title}
            </span>
          </>
        )}
      </div>

      {/* Right: action slot + theme switcher */}
      <div className="flex items-center gap-2">
        {actions}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Switch theme"
              className="text-text-tertiary"
            >
              <Icon className="h-4 w-4" />
            </Button>
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
      </div>
    </header>
  );
}
