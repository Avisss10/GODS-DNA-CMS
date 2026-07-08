import { create } from 'zustand';

export interface SavedFilter {
  id: string;
  pageKey: string; // mis. 'jemaat-list', 'event-list'
  name: string;
  filters: Record<string, unknown>;
}

interface SavedFiltersState {
  items: SavedFilter[];
  addFilter: (pageKey: string, name: string, filters: Record<string, unknown>) => void;
  removeFilter: (id: string) => void;
}

// SENGAJA tanpa persist middleware / localStorage — state murni di memori
// JS. Hilang begitu browser di-refresh, sesuai kriteria "persisten selama
// sesi berjalan" di prompt (bukan permanen).
export const useSavedFiltersStore = create<SavedFiltersState>((set) => ({
  items: [],
  addFilter: (pageKey, name, filters) =>
    set((state) => ({
      items: [
        ...state.items,
        { id: `${pageKey}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, pageKey, name, filters },
      ],
    })),
  removeFilter: (id) => set((state) => ({ items: state.items.filter((f) => f.id !== id) })),
}));