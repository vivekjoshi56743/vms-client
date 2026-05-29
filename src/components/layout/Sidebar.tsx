import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Video,
  Film,
  Camera,
  Activity,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Bell,
  Shield,
  FileText,
  Users,
  Plug,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useUIStore } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";
import { useEventsStore } from "@/stores/events";
import { useLogout } from "@/hooks/useAuth";
import { useAllCameraHealth } from "@/hooks/useCameras";

// ─── Nav structure ────────────────────────────────────────────────────────────

type NavItem = {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badgeKey?: "health" | "events" | "incidents";
};

type NavItemWithRoles = NavItem & { roles?: Array<"owner" | "admin" | "viewer"> };
type NavGroup = { label: string; items: NavItemWithRoles[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { to: "/dashboard", icon: LayoutDashboard, label: "Home" },
      { to: "/live",      icon: Video,           label: "Live" },
      { to: "/playback",  icon: Film,            label: "Playback" },
      { to: "/events",    icon: Bell,            label: "Events",    badgeKey: "events" },
      { to: "/incidents", icon: Shield,          label: "Incidents", badgeKey: "incidents" },
    ],
  },
  {
    label: "Infrastructure",
    items: [
      { to: "/health",    icon: Activity,  label: "Health",    badgeKey: "health" },
      { to: "/audit",     icon: FileText,  label: "Audit log" },
    ],
  },
  {
    label: "Manage",
    items: [
      { to: "/cameras",        icon: Camera,   label: "Cameras" },
      { to: "/settings/users", icon: Users,    label: "Users & roles", roles: ["owner", "admin"] },
      { to: "/settings",       icon: Plug,     label: "Connections" },
    ],
  },
];

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const user = useAuthStore((s) => s.user);
  const logout = useLogout();
  const navigate = useNavigate();
  const health = useAllCameraHealth();
  const unreadEvents = useEventsStore((s) => s.unread);

  const unhealthyCount =
    health.data?.filter((h) => h.status === "offline" || h.status === "degraded").length ?? 0;

  function badge(key: NavItem["badgeKey"]): number {
    if (key === "health") return unhealthyCount;
    if (key === "events") return unreadEvents;
    return 0; // incidents: stub until backend exposes an incidents API
  }

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-border-subtle bg-canvas-raised",
        "transition-[width] duration-200 ease-in-out",
        collapsed ? "w-[56px]" : "w-[228px]"
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          "flex h-[52px] flex-shrink-0 items-center border-b border-border-subtle",
          collapsed ? "justify-center px-3" : "px-5"
        )}
      >
        {collapsed ? (
          // Collapsed: just the accent square icon
          <span className="relative inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center">
            <span className="absolute inset-[3px] rounded-sm bg-accent" />
            <span className="absolute inset-0 rounded-sm border border-accent animate-brand-pulse" />
          </span>
        ) : (
          <div className="flex items-center gap-2">
            {/* Two-tone wordmark: "Super" white + "vision" cyan */}
            <span className="text-[15px] font-extrabold leading-none tracking-[-0.045em]">
              <span className="text-text-primary">Super</span>
              <span className="text-accent">vision</span>
            </span>
            {/* Live pulse dot */}
            <span
              className="mt-px h-[7px] w-[7px] flex-shrink-0 rounded-full bg-accent"
              style={{
                boxShadow: "0 0 6px var(--accent-glow)",
                animation: "live-breathe 2.4s ease-in-out infinite",
              }}
            />
          </div>
        )}
      </div>

      {/* Nav groups */}
      <nav className="flex flex-1 flex-col overflow-y-auto py-2">
        {NAV_GROUPS.map((group) => {
          // Role-gated items: hide entries restricted to roles the current
          // user doesn't have. If a whole group ends up empty (e.g. a viewer
          // with nothing under Manage), skip the section label too.
          const visibleItems = group.items.filter(
            (it) => !it.roles || (user?.role && it.roles.includes(user.role as "owner" | "admin" | "viewer"))
          );
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label} className="mb-1">
              {/* Section label */}
              {!collapsed && (
                <p className="px-5 pb-1.5 pt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
                  {group.label}
                </p>
              )}
              {collapsed && <div className="mx-3 my-1 border-t border-border-subtle" />}

              {visibleItems.map(({ to, icon: Icon, label, badgeKey }) => {
                const count = badgeKey ? badge(badgeKey) : 0;
                return (
                  <NavItem
                    key={to}
                    to={to}
                    icon={Icon}
                    label={label}
                    badge={count}
                    collapsed={collapsed}
                  />
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="flex-shrink-0 border-t border-border-subtle px-2 py-1.5">
        <button
          onClick={toggleSidebar}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex w-full items-center rounded px-2 py-1.5",
            "text-text-tertiary transition-colors duration-[120ms] hover:bg-surface hover:text-text-primary",
            collapsed ? "justify-center" : "justify-end"
          )}
        >
          {collapsed
            ? <ChevronRight className="h-3.5 w-3.5" />
            : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Footer: user info + logout */}
      <div className="flex-shrink-0 border-t border-border-subtle px-2 py-2">
        {user && !collapsed && (
          <div className="mb-1.5 px-2">
            <p className="truncate text-[12.5px] font-medium text-text-primary">
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
                "flex w-full items-center gap-2.5 rounded px-2 py-1.5",
                "text-[13px] text-text-tertiary transition-colors duration-[120ms]",
                "hover:bg-surface hover:text-status-critical",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                collapsed && "justify-center"
              )}
            >
              <LogOut className="h-[16px] w-[16px] flex-shrink-0" />
              {!collapsed && <span>Sign out</span>}
            </button>
          </TooltipTrigger>
          {collapsed && <TooltipContent side="right">Sign out</TooltipContent>}
        </Tooltip>
      </div>
    </aside>
  );
}

// ─── NavItem ──────────────────────────────────────────────────────────────────

function NavItem({
  to,
  icon: Icon,
  label,
  badge,
  collapsed,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge: number;
  collapsed: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={to}
          className={({ isActive }) =>
            cn(
              "relative flex items-center gap-[11px] rounded px-[9px] py-[7px] mx-2 text-[13px]",
              "transition-colors duration-[120ms]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              isActive
                ? "bg-accent-subtle text-accent-text font-medium"
                : "text-text-secondary hover:bg-surface hover:text-text-primary",
              collapsed && "justify-center"
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                className={cn(
                  "h-[16px] w-[16px] flex-shrink-0",
                  isActive ? "text-accent" : "text-current"
                )}
              />
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{label}</span>
                  {badge > 0 && (
                    <span className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-status-critical px-1 font-mono text-[10px] font-semibold text-white">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </>
              )}
              {/* Collapsed badge: dot only */}
              {collapsed && badge > 0 && (
                <span className="absolute right-1 top-1 h-[7px] w-[7px] rounded-full bg-status-critical" />
              )}
            </>
          )}
        </NavLink>
      </TooltipTrigger>
      {collapsed && (
        <TooltipContent side="right">
          {label}
          {badge > 0 && ` (${badge})`}
        </TooltipContent>
      )}
    </Tooltip>
  );
}
