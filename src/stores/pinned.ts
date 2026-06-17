import { create } from "zustand";
import { persist } from "zustand/middleware";

// Dashboard "pinned cameras" — user's curated short-list shown in the
// Pinned Cameras strip on the Home page. Persisted to localStorage so the
// selection survives reloads; the backend has no pin API yet, so this is
// purely a client-side preference for now. When the backend adds a pin
// endpoint we swap the persist target and the rest of the page is
// unchanged.
//
// Capped at PINNED_LIMIT (4) to keep the strip's 4-column layout balanced.

export const PINNED_LIMIT = 4;

interface PinnedState {
  /** Ordered list of camera IDs — preserves user's intent on display. */
  ids: string[];
  toggle: (id: string) => void;
  setAll: (ids: string[]) => void;
  clear: () => void;
}

export const usePinnedStore = create<PinnedState>()(
  persist(
    (set) => ({
      ids: [],
      toggle: (id) =>
        set((s) => {
          if (s.ids.includes(id)) {
            return { ids: s.ids.filter((x) => x !== id) };
          }
          if (s.ids.length >= PINNED_LIMIT) return s; // at cap — ignore
          return { ids: [...s.ids, id] };
        }),
      setAll: (ids) => set({ ids: ids.slice(0, PINNED_LIMIT) }),
      clear: () => set({ ids: [] }),
    }),
    { name: "supervision-pinned" }
  )
);
