import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Video,
  Film,
  Camera,
  Activity,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUIStore } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";
import { useLogout } from "@/hooks/useAuth";

const NAV_ITEMS = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/live",      icon: Video,           label: "Live" },
  { to: "/playback",  icon: Film,            label: "Playback" },
  { to: "/cameras",   icon: Camera,          label: "Cameras" },
  { to: "/health",    icon: Activity,        label: "Health" },
  { to: "/settings",  icon: Settings,        label: "Settings" },
] as const;

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-border-subtle bg-canvas-deep",
        "transition-[width] duration-200 ease-in-out",
        collapsed ? "w-[56px]" : "w-[220px]"
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          "flex h-16 flex-shrink-0 items-center border-b border-border-subtle px-3.5",
          collapsed ? "justify-center" : "gap-2.5"
        )}
      >
        <span className="relative inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center">
          <span className="absolute inset-[3px] rounded-sm bg-accent" />
          <span className="absolute inset-0 rounded-sm border border-accent animate-brand-pulse" />
        </span>
        {!collapsed && (
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-text-primary">
            Supervision
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavItem
            key={to}
            to={to}
            icon={Icon}
            label={label}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {/* Footer: user + logout */}
      <div className="flex-shrink-0 border-t border-border-subtle px-2 py-3">
        {user && !collapsed && (
          <div className="mb-2 px-2">
            <p className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-text-primary">
              {user.username}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-tertiary">
              {user.role}
            </p>
          </div>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleLogout}
              className={cn(
                "flex w-full items-center gap-2.5 rounded px-2 py-2",
                "text-text-tertiary transition-colors",
                "hover:bg-surface hover:text-status-critical",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                collapsed && "justify-center"
              )}
            >
              <LogOut className="h-[17px] w-[17px] flex-shrink-0" />
              {!collapsed && (
                <span className="text-[13px]">Sign out</span>
              )}
            </button>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="right">Sign out</TooltipContent>
          )}
        </Tooltip>
      </div>

      {/* Collapse toggle */}
      <div className="flex-shrink-0 border-t border-border-subtle px-2 py-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleSidebar}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn("w-full", collapsed ? "justify-center" : "justify-end")}
        >
          {collapsed
            ? <ChevronRight className="h-3.5 w-3.5" />
            : <ChevronLeft className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </aside>
  );
}

function NavItem({
  to,
  icon: Icon,
  label,
  collapsed,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  collapsed: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={to}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2.5 rounded px-2 py-2 text-[13px] transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              isActive
                ? "bg-surface text-text-primary font-medium"
                : "text-text-secondary hover:bg-surface hover:text-text-primary",
              collapsed && "justify-center"
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                className={cn(
                  "h-[17px] w-[17px] flex-shrink-0",
                  isActive ? "text-accent" : "text-current"
                )}
              />
              {!collapsed && <span>{label}</span>}
            </>
          )}
        </NavLink>
      </TooltipTrigger>
      {collapsed && (
        <TooltipContent side="right">{label}</TooltipContent>
      )}
    </Tooltip>
  );
}
