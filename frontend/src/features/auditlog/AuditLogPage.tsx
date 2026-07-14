import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, ScrollText, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Pagination from '@/components/Pagination';
import { useSort, type SortExtractors } from '@/hooks/useSort';
import { listAuditLogs, type AuditLogFilterParams, type AuditLogItem } from './auditlog.api';
import { AKSI_OPTIONS, MODUL_OPTIONS } from './auditlog.constants';
import AuditLogDiffModal from './components/AuditLogDiffModal';

const SELECT_CLASS =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const EMPTY_FILTERS: AuditLogFilterParams = {
  modul: '', aksi: '', userId: '', objectId: '', startDate: '', endDate: '',
};

const PAGE_SIZE = 20;
const FETCH_LIMIT = 500;
const AUTO_REFRESH_MS = 30_000;

const AUDIT_LOG_SORT_EXTRACTORS: SortExtractors<AuditLogItem> = {
  modul: (r) => r.modul,
  aksi: (r) => r.aksi,
  created_at: (r) => r.created_at,
};

export default function AuditLogPage() {
  const [filters, setFilters] = useState<AuditLogFilterParams>(EMPTY_FILTERS);
  const [selectedItem, setSelectedItem] = useState<AuditLogItem | null>(null);
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ['audit-logs', 'list', filters],
    queryFn: () => listAuditLogs({ ...filters, limit: FETCH_LIMIT }),
    refetchInterval: AUTO_REFRESH_MS,
  });

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const items = data ?? [];
  const { sorted: sortedItems, handleSort, directionFor } = useSort(items, AUDIT_LOG_SORT_EXTRACTORS);
  const hasActiveFilter = Object.values(filters).some((v) => v);
  const isPossiblyTruncated = !isLoading && items.length === FETCH_LIMIT;

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / PAGE_SIZE));
  const paginated = sortedItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function updateFilter<K extends keyof AuditLogFilterParams>(key: K, value: AuditLogFilterParams[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
          <ScrollText className="h-5 w-5 text-modul-auditlog" />
          Audit Log
          {isFetching && !isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-label="Memperbarui..." />
          )}
        </h1>
        <p className="text-sm text-slate-500">Riwayat aktivitas seluruh modul, terverifikasi HMAC</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-card border border-slate-200 bg-card p-3">
        <select value={filters.modul} onChange={(e) => updateFilter('modul', e.target.value)} className={SELECT_CLASS}>
          <option value="">Semua Modul</option>
          {MODUL_OPTIONS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <select value={filters.aksi} onChange={(e) => updateFilter('aksi', e.target.value)} className={SELECT_CLASS}>
          <option value="">Semua Aksi</option>
          {AKSI_OPTIONS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <Input placeholder="User ID" value={filters.userId} onChange={(e) => updateFilter('userId', e.target.value)} className="w-28" />
        <Input placeholder="Object ID" value={filters.objectId} onChange={(e) => updateFilter('objectId', e.target.value)} className="w-28" />
        <Input type="date" value={filters.startDate} onChange={(e) => updateFilter('startDate', e.target.value)} className="w-40" />
        <Input type="date" value={filters.endDate} onChange={(e) => updateFilter('endDate', e.target.value)} className="w-40" />

        {hasActiveFilter && (
          <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
            Reset Filter
          </Button>
        )}
      </div>

      {isError && (
        <p className="rounded-card border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Gagal memuat audit log. Silakan muat ulang halaman.
        </p>
      )}

      {isPossiblyTruncated && (
        <p className="rounded-card border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Menampilkan {FETCH_LIMIT} log terbaru — kemungkinan masih ada log lain yang belum termuat.
          Gunakan filter (modul/aksi/tanggal) untuk mempersempit hasil.
        </p>
      )}

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 rounded-card" />
          ))}
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-slate-300 py-16 text-center">
          <Search className="h-10 w-10 text-slate-300" />
          <p className="font-medium text-slate-600">Tidak ada audit log yang cocok dengan filter</p>
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <>
          {/* Desktop/tablet */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>No</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead
                    sortable
                    sortDirection={directionFor('modul')}
                    onSortAsc={() => handleSort('modul', 'asc')}
                    onSortDesc={() => handleSort('modul', 'desc')}
                  >
                    Modul
                  </TableHead>
                  <TableHead
                    sortable
                    sortDirection={directionFor('aksi')}
                    onSortAsc={() => handleSort('aksi', 'asc')}
                    onSortDesc={() => handleSort('aksi', 'desc')}
                  >
                    Aksi
                  </TableHead>
                  <TableHead>Object ID</TableHead>
                  <TableHead>User ID</TableHead>
                  <TableHead
                    sortable
                    sortDirection={directionFor('created_at')}
                    onSortAsc={() => handleSort('created_at', 'asc')}
                    onSortDesc={() => handleSort('created_at', 'desc')}
                  >
                    Waktu
                  </TableHead>
                  <TableHead className="text-center">Integritas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((row, i) => (
                  <TableRow
                    key={row.id}
                    onClick={() => setSelectedItem(row)}
                    className="cursor-pointer"
                  >
                    <TableCell className="text-slate-500">{(page - 1) * PAGE_SIZE + i + 1}</TableCell>
                    <TableCell className="text-slate-500">{row.id}</TableCell>
                    <TableCell className="font-medium text-slate-800">{row.modul}</TableCell>
                    <TableCell className="text-slate-600">{row.aksi}</TableCell>
                    <TableCell className="text-slate-600">{row.object_id ?? '-'}</TableCell>
                    <TableCell className="text-slate-600">{row.user_id ?? '-'}</TableCell>
                    <TableCell className="text-slate-500">{new Date(row.created_at).toLocaleString('id-ID')}</TableCell>
                    <TableCell className="text-center">
                      {row.hmac_status !== 'OK' && (
                        <span title={`hmac_status: ${row.hmac_status}`}>
                          <AlertTriangle className="mx-auto h-4 w-4 text-red-600" />
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: card-list, tetap bisa diklik untuk buka diff modal */}
          <div className="space-y-2 sm:hidden">
            {paginated.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedItem(row)}
                className="flex w-full items-start justify-between gap-3 rounded-card border border-slate-200 bg-card p-3 text-left transition-colors hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">#{row.id}</span>
                    <span className="font-medium text-slate-800">{row.modul}</span>
                    <span className="text-slate-500">— {row.aksi}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Object: {row.object_id ?? '-'} · User: {row.user_id ?? '-'}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {new Date(row.created_at).toLocaleString('id-ID')}
                  </p>
                </div>
                {row.hmac_status !== 'OK' && (
                  <span title={`hmac_status: ${row.hmac_status}`} className="shrink-0">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                  </span>
                )}
              </button>
            ))}
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            itemLabel="log"
            totalItems={sortedItems.length}
          />
        </>
      )}

      <AuditLogDiffModal item={selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)} />
    </div>
  );
}