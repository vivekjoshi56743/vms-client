import { create } from "zustand";
import { persist } from "zustand/middleware";

// UI store — theme + sidebar collapse. Rule 5: the theme setter is the
// SINGLE place that mutates data-theme / data-mode on <html>.
// Rule 6: this is client state only; no server data lives here.

export type Theme = "light" | "dark-standard" | "dark-surveillance";

interface UIState {
  theme: Theme;
  sidebarCollapsed: boolean;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme === "light" ? "light" : "dark");
  root.setAttribute(
    "data-mode",
    theme === "dark-surveillance" ? "surveillance" : "standard"
  );
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: "dark-standard",
      sidebarCollapsed: false,
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: "supervision-ui",
      // On rehydrate from localStorage, push the stored theme to the DOM
      // before React renders so we don't flash the wrong palette.
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    }
  )
);
