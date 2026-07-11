import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { Download, Eye, Loader2, Plus, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableCheckboxCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
} from '@/components/ui/table';
import PrintButton from '@/components/PrintButton';
import Breadcrumb from '@/components/Breadcrumb';
import BulkActionToolbar from '@/components/BulkActionToolbar';
import BulkActionSummaryDialog from '@/components/BulkActionSummaryDialog';
import ConfirmDialog from '@/components/ConfirmDialog';
import SavedFiltersBar from '@/components/SavedFiltersBar';
import Pagination from '@/components/Pagination';
import { useBulkAction, type BulkActionResult } from '@/hooks/useBulkAction';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import { useSort, type SortExtractors } from '@/hooks/useSort';
import type { JemaatDependencies, JemaatListItem, StatusKeaktifan } from '@/types/jemaat.types';
import { deleteJemaat, listJemaat } from './jemaat.api';
import { STATUS_FILTER_OPTIONS } from './jemaat.constants';
import StatusKeaktifanBadge from './components/StatusKeaktifanBadge';
import JemaatFormModal from './components/JemaatFormModal';
import JemaatExportDialog from './components/JemaatExportDialog';

const PAGE_SIZE = 20;
const FETCH_LIMIT = 500;

const JEMAAT_SORT_EXTRACTORS: SortExtractors<JemaatListItem> = {
  nama: (j) => j.nama,
  tgl_bergabung: (j) => j.tgl_bergabung ?? '',
  skor_keaktifan: (j) => j.skor_keaktifan ?? -1,
  status_keaktifan: (j) => j.status_keaktifan,
};

interface JemaatSavedFilter {
  search: string;
  status: StatusKeaktifan | 'ALL';
}

function formatTanggal(dateStr: string | null) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Ubah bentuk 409 dependency (JemaatDependencies) jadi ringkasan 1 baris
// yang enak dibaca di ringkasan hasil bulk action.
function extractDeleteErrorMessage(err: unknown): string {
  if (isAxiosError<{ detail?: JemaatDependencies; message?: string }>(err)) {
    const detail = err.response?.data?.detail;
    if (detail) {
      const parts: string[] = [];
      if (detail.isLeaderOfActiveCg.length > 0) parts.push(`leader ${detail.isLeaderOfActiveCg.length} CG aktif`);
      if (detail.activeMemberOfCg.length > 0) parts.push(`anggota ${detail.activeMemberOfCg.length} CG aktif`);
      if (detail.scheduledAsVolunteer.length > 0) {
        parts.push(`terjadwal volunteer di ${detail.scheduledAsVolunteer.length} event`);
      }
      if (parts.length > 0) return `Masih ${parts.join(', ')}`;
    }
    if (err.response?.data?.message) return err.response.data.message;
  }
  return 'Gagal menonaktifkan';
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

  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkActionResult[] | null>(null);
  const { run: runBulk, isRunning: isBulkRunning } = useBulkAction();
  const [exportOpen, setExportOpen] = useState(false);

  const { savedFilters, save: saveFilter, remove: removeFilter } = useSavedFilters<JemaatSavedFilter>('jemaat-list');

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

  const { sorted, handleSort, directionFor } = useSort(filtered, JEMAAT_SORT_EXTRACTORS);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const hasNoJemaatAtAll = !isLoading && !isError && (data?.length ?? 0) === 0;
  const hasNoFilterResult = !isLoading && !isError && (data?.length ?? 0) > 0 && filtered.length === 0;
  const hasActiveFilter = searchInput.trim() !== '' || statusFilter !== 'ALL';
  // Ringkasan filter aktif untuk dicatat di file export (Excel/PDF) —
  // undefined kalau tidak ada filter, biar backend tidak mencetak baris
  // "Filter aktif" sama sekali.
  const exportFilterDescription = hasActiveFilter
    ? [
        statusFilter !== 'ALL' && `Status: ${STATUS_FILTER_OPTIONS.find((o) => o.value === statusFilter)?.label ?? statusFilter}`,
        searchInput.trim() !== '' && `Pencarian: "${searchInput.trim()}"`,
      ]
        .filter(Boolean)
        .join('; ')
    : undefined;
  // Query hanya mengambil FETCH_LIMIT baris — kalau jumlahnya persis pas
  // limit, kemungkinan besar masih ada jemaat lain yang tidak ikut termuat
  // (tidak tampil di tabel, tidak bisa dicentang/diexport).
  const isPossiblyTruncated = !isLoading && (data?.length ?? 0) === FETCH_LIMIT;

  function resetFilters() {
    setSearchInput('');
    setDebouncedSearch('');
    setStatusFilter('ALL');
  }

  function applyFilter(filters: JemaatSavedFilter) {
    setSearchInput(filters.search);
    setDebouncedSearch(filters.search);
    setStatusFilter(filters.status);
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

  function jemaatNameById(id: number): string {
    return data?.find((j) => j.id === id)?.nama ?? `#${id}`;
  }

  async function handleConfirmBulkDeactivate() {
    const ids = Array.from(selectedIds);
    const results = await runBulk(ids, (id) => deleteJemaat(id), extractDeleteErrorMessage);
    setBulkConfirmOpen(false);
    setBulkResults(results);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['jemaat', 'list-all'] });
  }

  return (
    <div className="space-y-4">
      <Breadcrumb segments={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Jemaat' }]} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Jemaat</h1>
          <p className="text-sm text-slate-500 print:hidden">Kelola data jemaat gereja</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <PrintButton />
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" />
            Tambah Jemaat
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center print:hidden">
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

      <SavedFiltersBar
        savedFilters={savedFilters}
        hasActiveFilter={hasActiveFilter}
        onSave={(name) => saveFilter(name, { search: searchInput, status: statusFilter })}
        onApply={applyFilter}
        onRemove={removeFilter}
      />

      <BulkActionToolbar
        count={selectedIds.size}
        actionLabel="Nonaktifkan Terpilih"
        onAction={() => setBulkConfirmOpen(true)}
        onClear={() => setSelectedIds(new Set())}
        extraActions={
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
            <Download className="h-3.5 w-3.5" />
            Export Terpilih
          </Button>
        }
      />

      {isError && (
        <p className="rounded-card border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Gagal memuat data jemaat. Silakan muat ulang halaman.
        </p>
      )}

      {isPossiblyTruncated && (
        <p className="rounded-card border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 print:hidden">
          Menampilkan {FETCH_LIMIT} jemaat pertama — kemungkinan masih ada jemaat lain yang belum termuat.
          Gunakan pencarian untuk menemukan jemaat tertentu; pilih/export hanya berlaku untuk yang tampil di sini.
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
          {/* Desktop table (>=640px, dan SELALU tampil saat print) */}
          <div className="hidden sm:block print:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableCheckboxCell as="th" className="print:hidden">
                    <input
                      type="checkbox"
                      checked={paginated.length > 0 && paginated.every((j) => selectedIds.has(j.id))}
                      onChange={toggleSelectAllOnPage}
                      aria-label="Pilih semua di halaman ini"
                    />
                  </TableCheckboxCell>
                  <TableHead>No</TableHead>
                  <TableHead
                    sortable
                    sortDirection={directionFor('nama')}
                    onSortAsc={() => handleSort('nama', 'asc')}
                    onSortDesc={() => handleSort('nama', 'desc')}
                  >
                    Nama
                  </TableHead>
                  <TableHead
                    sortable
                    sortDirection={directionFor('tgl_bergabung')}
                    onSortAsc={() => handleSort('tgl_bergabung', 'asc')}
                    onSortDesc={() => handleSort('tgl_bergabung', 'desc')}
                  >
                    Tanggal Bergabung
                  </TableHead>
                  <TableHead
                    sortable
                    sortDirection={directionFor('skor_keaktifan')}
                    onSortAsc={() => handleSort('skor_keaktifan', 'asc')}
                    onSortDesc={() => handleSort('skor_keaktifan', 'desc')}
                  >
                    Skor Keaktifan
                  </TableHead>
                  <TableHead
                    sortable
                    sortDirection={directionFor('status_keaktifan')}
                    onSortAsc={() => handleSort('status_keaktifan', 'asc')}
                    onSortDesc={() => handleSort('status_keaktifan', 'desc')}
                  >
                    Status
                  </TableHead>
                  <TableHead className="text-right print:hidden">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableSkeletonRows rows={5} columns={7} />}

                {!isLoading &&
                  paginated.map((j, i) => (
                    <TableRow key={j.id} selected={selectedIds.has(j.id)}>
                      <TableCheckboxCell className="print:hidden">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(j.id)}
                          onChange={() => toggleSelect(j.id)}
                          aria-label={`Pilih ${j.nama}`}
                        />
                      </TableCheckboxCell>
                      <TableCell className="text-slate-500">{(page - 1) * PAGE_SIZE + i + 1}</TableCell>
                      <TableCell className="font-medium text-slate-800">{j.nama}</TableCell>
                      <TableCell className="text-slate-600">{formatTanggal(j.tgl_bergabung)}</TableCell>
                      <TableCell className="text-slate-600">{j.skor_keaktifan ?? '-'}</TableCell>
                      <TableCell>
                        <StatusKeaktifanBadge status={j.status_keaktifan} />
                      </TableCell>
                      <TableCell className="text-right print:hidden">
                        <Button asChild variant="outline" size="sm">
                          <Link to={`/jemaat/${j.id}`}>
                            <Eye className="h-3.5 w-3.5" />
                            Detail
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile card-list (<640px, disembunyikan saat print supaya tidak dobel dgn tabel) */}
          <div className="space-y-3 sm:hidden print:hidden">
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-card" />)}

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
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/jemaat/${j.id}`}>
                        <Eye className="h-3.5 w-3.5" />
                        Detail
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
          </div>

          {filtered.length > 0 && (
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} itemLabel="jemaat" totalItems={filtered.length} />
          )}
        </>
      )}

      <JemaatFormModal open={formOpen} onOpenChange={setFormOpen} mode="create" onSuccess={handleCreated} />

      <JemaatExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        ids={Array.from(selectedIds)}
        filterDescription={exportFilterDescription}
      />

      <ConfirmDialog
        open={bulkConfirmOpen}
        title={`Nonaktifkan ${selectedIds.size} jemaat terpilih?`}
        description="Setiap jemaat akan dinonaktifkan satu per satu (soft delete). Jemaat dengan dependensi aktif (leader CG, anggota CG, atau terjadwal volunteer) akan dilewati dan dilaporkan gagal."
        confirmLabel="Ya, Nonaktifkan"
        isSubmitting={isBulkRunning}
        onOpenChange={setBulkConfirmOpen}
        onConfirm={handleConfirmBulkDeactivate}
      />

      <BulkActionSummaryDialog
        open={!!bulkResults}
        results={bulkResults}
        itemLabel={jemaatNameById}
        onOpenChange={(open) => !open && setBulkResults(null)}
      />
    </div>
  );
}