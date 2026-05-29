import { create } from "zustand";

// Ring-buffer of recently received SSE events.
//
// In-memory only — the backend doesn't expose an /api/events/history endpoint
// yet, so a reload starts fresh. The EventsPage surfaces this in its empty
// state.

export interface EventLogItem {
  /** Local monotonically-increasing id, used as a React key. */
  id: number;
  /** Original 4-segment topic, e.g. "camera.cam-abc.health.changed". */
  topic: string;
  domain: string;
  entityId: string;
  kind: string;
  state: string;
  data: unknown;
  receivedAt: number;
}

const MAX_ITEMS = 200;

interface EventsState {
  items: EventLogItem[];
  unread: number;
  push: (ev: Omit<EventLogItem, "id" | "receivedAt">) => void;
  markAllRead: () => void;
  clear: () => void;
}

let nextId = 1;

export const useEventsStore = create<EventsState>((set) => ({
  items: [],
  unread: 0,
  push: (ev) =>
    set((s) => {
      const item: EventLogItem = {
        ...ev,
        id: nextId++,
        receivedAt: Date.now(),
      };
      const items = [item, ...s.items].slice(0, MAX_ITEMS);
      return { items, unread: s.unread + 1 };
    }),
  markAllRead: () => set({ unread: 0 }),
  clear: () => set({ items: [], unread: 0 }),
}));
