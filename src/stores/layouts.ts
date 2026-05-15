import { create } from "zustand";
import { persist } from "zustand/middleware";

export type GridSize = "1x1" | "2x2" | "3x3" | "4x4";

export interface Layout {
  id: string;
  name: string;
  size: GridSize;
  /** Camera IDs per slot. null = empty slot. */
  slots: (string | null)[];
}

function slotCount(size: GridSize): number {
  const n = parseInt(size[0]!);
  return n * n;
}

function makeDefaultLayout(cameras: string[]): Layout {
  return {
    id: "default",
    name: "Main Display",
    size: "3x3",
    slots: Array.from({ length: 9 }, (_, i) => cameras[i] ?? null),
  };
}

interface LayoutsState {
  layouts: Layout[];
  activeId: string | null;
  setActive: (id: string) => void;
  setSlot: (layoutId: string, slotIndex: number, cameraId: string | null) => void;
  setSize: (layoutId: string, size: GridSize) => void;
  createLayout: (name: string, size: GridSize) => void;
  deleteLayout: (id: string) => void;
  /** Seed with camera IDs on first load if no layouts exist yet. */
  ensureDefault: (cameraIds: string[]) => void;
}

export const useLayoutsStore = create<LayoutsState>()(
  persist(
    (set, get) => ({
      layouts: [],
      activeId: null,

      setActive: (id) => set({ activeId: id }),

      setSlot: (layoutId, slotIndex, cameraId) =>
        set((s) => ({
          layouts: s.layouts.map((l) => {
            if (l.id !== layoutId) return l;
            const slots = [...l.slots];
            slots[slotIndex] = cameraId;
            return { ...l, slots };
          }),
        })),

      setSize: (layoutId, size) =>
        set((s) => ({
          layouts: s.layouts.map((l) => {
            if (l.id !== layoutId) return l;
            const count = slotCount(size);
            const slots = Array.from({ length: count }, (_, i) => l.slots[i] ?? null);
            return { ...l, size, slots };
          }),
        })),

      createLayout: (name, size) => {
        const id = crypto.randomUUID();
        const slots = Array.from<null>({ length: slotCount(size) }).fill(null);
        set((s) => ({
          layouts: [...s.layouts, { id, name, size, slots }],
          activeId: s.activeId ?? id,
        }));
      },

      deleteLayout: (id) =>
        set((s) => {
          const remaining = s.layouts.filter((l) => l.id !== id);
          const activeId =
            s.activeId === id
              ? (remaining[0]?.id ?? null)
              : s.activeId;
          return { layouts: remaining, activeId };
        }),

      ensureDefault: (cameraIds) => {
        if (get().layouts.length > 0) return;
        const layout = makeDefaultLayout(cameraIds);
        set({ layouts: [layout], activeId: layout.id });
      },
    }),
    { name: "supervision-layouts" }
  )
);
