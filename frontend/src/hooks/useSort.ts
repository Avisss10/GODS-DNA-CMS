import { useMemo, useState } from 'react';

export type SortDirection = 'asc' | 'desc';
export type SortValue = string | number | null | undefined;
export type SortExtractors<T> = Record<string, (item: T) => SortValue>;

// Hook generik untuk sort client-side di tabel: `extractors` adalah map
// per-kolom yang mengambil nilai pembanding dari tiap row (string/number),
// supaya kolom numerik/tanggal tidak ikut disortir sebagai string biasa.
export function useSort<T>(
  data: T[],
  extractors: SortExtractors<T>,
  initial?: { field: string; direction: SortDirection },
) {
  const [sortField, setSortField] = useState<string | null>(initial?.field ?? null);
  const [sortDir, setSortDir] = useState<SortDirection>(initial?.direction ?? 'asc');

  function handleSort(field: string, direction: SortDirection = 'asc') {
    setSortField(field);
    setSortDir(direction);
  }

  const sorted = useMemo(() => {
    const extract = sortField ? extractors[sortField] : undefined;
    if (!extract) return data;
    const copy = [...data];
    copy.sort((a, b) => {
      const va = extract(a);
      const vb = extract(b);
      const aNull = va == null;
      const bNull = vb == null;
      // Nilai null diperlakukan sebagai "terbesar" lalu ikut di-flip oleh
      // sortDir sama seperti nilai lain — supaya null tetap ikut berpindah
      // posisi saat user pilih Z-A, bukan selalu diam di bawah.
      const cmp = aNull && bNull
        ? 0
        : aNull
          ? 1
          : bNull
            ? -1
            : typeof va === 'number' && typeof vb === 'number'
              ? va - vb
              : String(va).localeCompare(String(vb), 'id', { numeric: true, sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [data, extractors, sortField, sortDir]);

  function directionFor(field: string): SortDirection | false {
    return sortField === field ? sortDir : false;
  }

  return { sorted, sortField, sortDir, handleSort, directionFor };
}
