import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader2, Plus, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { StatusKeaktifan } from '@/types/jemaat.types';
import { listJemaat } from './jemaat.api';
import { STATUS_FILTER_OPTIONS } from './jemaat.constants';
import StatusKeaktifanBadge from './components/StatusKeaktifanBadge';
import JemaatFormModal from './components/JemaatFormModal';

const PAGE_SIZE = 20;
const FETCH_LIMIT = 500;

function formatTanggal(dateStr: string | null) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function JemaatListPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['jemaat', 'list-all'],
    queryFn: () => listJemaat({ limit: FETCH_LIMIT }),
  });

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isDebouncing, setIsDebouncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusKeaktifan | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [formOpen, setFormOpen] = useState(false);

  // Debounce ~400ms. Hasil sebelumnya TETAP tampil selama menunggu —
  // yang berubah hanya spinner kecil di ujung search box.
  useEffect(() => {
    setIsDebouncing(true);
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setIsDebouncing(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = debouncedSearch.trim().toLowerCase();
    return data.filter((j) => {
      const matchSearch = term === '' || j.nama.toLowerCase().includes(term);
      const matchStatus = statusFilter === 'ALL' || j.status_keaktifan === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [data, debouncedSearch, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const hasNoJemaatAtAll = !isLoading && !isError && (data?.length ?? 0) === 0;
  const hasNoFilterResult = !isLoading && !isError && (data?.length ?? 0) > 0 && filtered.length === 0;

  function resetFilters() {
    setSearchInput('');
    setDebouncedSearch('');
    setStatusFilter('ALL');
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = paginated.length > 0 && paginated.every((j) => next.has(j.id));
      paginated.forEach((j) => (allSelected ? next.delete(j.id) : next.add(j.id)));
      return next;
    });
  }

  function handleCreated() {
    queryClient.invalidateQueries({ queryKey: ['jemaat', 'list-all'] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Jemaat</h1>
          <p className="text-sm text-slate-500">Kelola data jemaat gereja</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" />
          Tambah Jemaat
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cari nama jemaat..."
            className="pl-9 pr-9"
          />
          {isDebouncing && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />
          )}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusKeaktifan | 'ALL')}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-56"
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {isError && (
        <p className="rounded-card border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Gagal memuat data jemaat. Silakan muat ulang halaman.
        </p>
      )}

      {hasNoJemaatAtAll && (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-slate-300 py-16 text-center">
          <Users className="h-10 w-10 text-slate-300" />
          <p className="font-medium text-slate-600">Belum ada jemaat sama sekali</p>
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" />
            Tambah Jemaat
          </Button>
        </div>
      )}

      {hasNoFilterResult && (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-slate-300 py-16 text-center">
          <Search className="h-10 w-10 text-slate-300" />
          <p className="font-medium text-slate-600">Hasil pencarian/filter tidak ditemukan</p>
          <Button variant="outline" onClick={resetFilters}>
            Reset Filter
          </Button>
        </div>
      )}

      {!hasNoJemaatAtAll && !hasNoFilterResult && (
        <>
          {/* Desktop table (>=640px) */}
          <div className="hidden overflow-x-auto rounded-card border border-slate-200 sm:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={paginated.length > 0 && paginated.every((j) => selectedIds.has(j.id))}
                      onChange={toggleSelectAllOnPage}
                      aria-label="Pilih semua di halaman ini"
                    />
                  </th>
                  <th className="px-4 py-3">Nama</th>
                  <th className="px-4 py-3">Tanggal Bergabung</th>
                  <th className="px-4 py-3">Skor Keaktifan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="px-4 py-3">
                        <div className="h-5 w-full animate-pulse rounded bg-slate-100" />
                      </td>
                    </tr>
                  ))}

                {!isLoading &&
                  paginated.map((j) => (
                    <tr key={j.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        {/* TODO Tahap 9: hubungkan ke aksi bulk (aktif/nonaktifkan/hapus massal) */}
                        <input
                          type="checkbox"
                          checked={selectedIds.has(j.id)}
                          onChange={() => toggleSelect(j.id)}
                          aria-label={`Pilih ${j.nama}`}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{j.nama}</td>
                      <td className="px-4 py-3 text-slate-600">{formatTanggal(j.tgl_bergabung)}</td>
                      <td className="px-4 py-3 text-slate-600">{j.skor_keaktifan ?? '-'}</td>
                      <td className="px-4 py-3">
                        <StatusKeaktifanBadge status={j.status_keaktifan} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link to={`/jemaat/${j.id}`} className="text-sm font-medium text-accent-from hover:underline">
                          Lihat detail
                        </Link>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card-list (<640px) */}
          <div className="space-y-3 sm:hidden">
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-card bg-slate-100" />
              ))}

            {!isLoading &&
              paginated.map((j) => (
                <div key={j.id} className="rounded-card border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedIds.has(j.id)}
                        onChange={() => toggleSelect(j.id)}
                        aria-label={`Pilih ${j.nama}`}
                      />
                      <div>
                        <p className="font-semibold text-slate-800">{j.nama}</p>
                        <p className="text-xs text-slate-500">Bergabung {formatTanggal(j.tgl_bergabung)}</p>
                      </div>
                    </div>
                    <StatusKeaktifanBadge status={j.status_keaktifan} />
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
                    <span className="text-slate-500">
                      Skor: <span className="font-medium text-slate-700">{j.skor_keaktifan ?? '-'}</span>
                    </span>
                    <Link to={`/jemaat/${j.id}`} className="font-medium text-accent-from hover:underline">
                      Lihat detail
                    </Link>
                  </div>
                </div>
              ))}
          </div>

          {filtered.length > 0 && (
            <div className="flex items-center justify-between pt-2 text-sm text-slate-600">
              <span>
                Halaman {page} dari {totalPages} ({filtered.length} jemaat)
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <JemaatFormModal open={formOpen} onOpenChange={setFormOpen} mode="create" onSuccess={handleCreated} />
    </div>
  );
}