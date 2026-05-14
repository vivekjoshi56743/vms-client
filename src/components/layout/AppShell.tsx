import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

interface AppShellProps {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
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

export function AppShell({ title, actions, children }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-canvas text-text-primary">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title={title} actions={actions} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
