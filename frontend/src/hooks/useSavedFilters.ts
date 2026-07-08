import { useSavedFiltersStore } from '@/store/savedFilters.store';

export interface SavedFilterChip<T> {
  id: string;
  name: string;
  filters: T;
}

// Hook generik: scope otomatis ke satu halaman lewat `pageKey`, supaya
// filter tersimpan JemaatListPage tidak tercampur dengan EventListPage dst.
// Constraint `object` (bukan Record<string, unknown>) supaya interface
// biasa (mis. JemaatSavedFilter, EventSavedFilter) valid dipakai sebagai T
// tanpa perlu index signature eksplisit.
export function useSavedFilters<T extends object>(pageKey: string) {
  const items = useSavedFiltersStore((s) => s.items);
  const addFilter = useSavedFiltersStore((s) => s.addFilter);
  const removeFilter = useSavedFiltersStore((s) => s.removeFilter);

  const savedFilters: SavedFilterChip<T>[] = items
    .filter((f) => f.pageKey === pageKey)
    .map((f) => ({ id: f.id, name: f.name, filters: f.filters as T }));

  function save(name: string, filters: T) {
    addFilter(pageKey, name, filters as Record<string, unknown>);
  }

  function remove(id: string) {
    removeFilter(id);
  }

  return { savedFilters, save, remove };
}