import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { useUIStore } from "@/stores/ui";
import { cn } from "@/lib/cn";

interface AppShellProps {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Override the main element's overflow class. Use "overflow-hidden" for
   *  pages that manage their own scrolling (e.g. LivePage with VideoGrid). */
  mainClassName?: string;
}

// Root layout for every authenticated page:
//
//   ┌──────────────────────────────────────────┐
//   │  Sidebar (collapsed/expanded)  │ TopBar  │
//   │                                │─────────│
//   │  Nav links                     │ <main>  │
//   │  ···                           │         │
//   │  User / logout                 │         │
//   └──────────────────────────────────────────┘
//
// Sidebar width transitions via CSS (200 ease-in-out) and is persisted to
// localStorage by the UI store (Rule 6: client-only state in Zustand).

export function AppShell({ title, actions, children, mainClassName }: AppShellProps) {
  const surveillance = useUIStore((s) => s.theme === "dark-surveillance");

  // Surveillance mode hides the sidebar + topbar so the page content fills
  // the screen. The LivePage's internal sub-header still has the "Exit"
  // button (and Escape works too — see SurveillanceEnforcer in App.tsx) so
  // the user can always get back to the standard chrome.
  if (surveillance) {
    return (
      <div className="flex h-screen overflow-hidden bg-canvas text-text-primary">
        <main className={cn("flex-1", mainClassName ?? "overflow-y-auto")}>
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas text-text-primary">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title={title} actions={actions} />
        <main className={cn("flex-1", mainClassName ?? "overflow-y-auto")}>
          {children}
        </main>
      </div>
    </div>
  );
}
