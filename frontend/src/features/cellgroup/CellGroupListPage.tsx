import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, UsersRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import Breadcrumb from '@/components/Breadcrumb';
import BulkActionToolbar from '@/components/BulkActionToolbar';
import BulkActionSummaryDialog from '@/components/BulkActionSummaryDialog';
import ConfirmDialog from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import PulsingDot from '@/components/PulsingDot';
import { cn } from '@/lib/utils';
import { useBulkAction, type BulkActionResult } from '@/hooks/useBulkAction';
import { deactivateCellGroup, listCellGroups } from './cellgroup.api';
import CellGroupFormModal from './components/CellGroupFormModal';

export default function CellGroupListPage() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkActionResult[] | null>(null);
  const { run: runBulk, isRunning: isBulkRunning } = useBulkAction();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cellgroup', 'list'],
    queryFn: () => listCellGroups({ limit: 200 }),
  });

  function handleCreated() {
    queryClient.invalidateQueries({ queryKey: ['cellgroup', 'list'] });
  }

  // GET /cell-groups backend hanya mengembalikan CG aktif, jadi seluruh
  // item di sini selalu is_active=true — filter ini defensif saja.
  const activeCgs = (data ?? []).filter((cg) => cg.is_active);

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllActive() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = activeCgs.length > 0 && activeCgs.every((cg) => next.has(cg.id));
      activeCgs.forEach((cg) => (allSelected ? next.delete(cg.id) : next.add(cg.id)));
      return next;
    });
  }

  function cgNameById(id: number): string {
    return data?.find((cg) => cg.id === id)?.nama ?? `#${id}`;
  }

  async function handleConfirmBulkDeactivate() {
    const ids = Array.from(selectedIds);
    const results = await runBulk(ids, (id) => deactivateCellGroup(id));
    setBulkConfirmOpen(false);
    setBulkResults(results);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['cellgroup', 'list'] });
  }

  const isEmpty = !isLoading && !isError && (data?.length ?? 0) === 0;

  return (
    <div className="space-y-4">
      <Breadcrumb segments={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Cell Group' }]} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Cell Group</h1>
          <p className="text-sm text-slate-500">Kelola Cell Group dan aktivitasnya</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" />
          Tambah Cell Group
        </Button>
      </div>

      {isError && <ErrorState message="Gagal memuat data Cell Group. Silakan muat ulang halaman." />}

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      )}

      {isEmpty && (
        <EmptyState
          icon={UsersRound}
          title="Belum ada Cell Group"
          action={
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" />
              Tambah Cell Group
            </Button>
          }
        />
      )}

      {!isLoading && !isEmpty && (
        <>
          {activeCgs.length > 0 && (
            <label className="flex w-fit items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={activeCgs.every((cg) => selectedIds.has(cg.id))}
                onChange={toggleSelectAllActive}
              />
              Pilih semua ({activeCgs.length})
            </label>
          )}

          <BulkActionToolbar
            count={selectedIds.size}
            actionLabel="Nonaktifkan Terpilih"
            onAction={() => setBulkConfirmOpen(true)}
            onClear={() => setSelectedIds(new Set())}
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data!.map((cg) => (
              <Link
                key={cg.id}
                to={`/cellgroup/${cg.id}`}
                className={cn(
                  'relative block rounded-xl border-y border-r border-l-4 border-y-slate-200/70 border-r-slate-200/70 border-l-modul-cellgroup bg-card p-4 shadow-card transition-smooth hover:-translate-y-0.5 hover:shadow-card-hover',
                )}
              >
                {cg.is_active && (
                  <label
                    className="absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded bg-white/90 shadow"
                    onClick={(e) => e.stopPropagation()}
                    title="Pilih untuk nonaktifkan massal"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(cg.id)}
                      onChange={() => toggleSelect(cg.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Pilih ${cg.nama}`}
                    />
                  </label>
                )}
                <div className="flex items-start justify-between gap-2 pl-6">
                  <h3 className="font-semibold text-slate-800">{cg.nama}</h3>
                  <Badge variant={cg.is_active ? 'default' : 'secondary'} className="gap-1.5">
                    {cg.is_active && <PulsingDot colorClass="bg-status-aktif" />}
                    {cg.is_active ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </div>
                {cg.deskripsi && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{cg.deskripsi}</p>}
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
                  <span className="text-slate-500">
                    Leader: <span className="font-medium text-slate-700">{cg.nama_leader ?? '-'}</span>
                  </span>
                  <span className="flex items-center gap-1 text-slate-500">
                    <UsersRound className="h-3.5 w-3.5" /> {cg.jumlah_anggota}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <CellGroupFormModal open={formOpen} onOpenChange={setFormOpen} mode="create" onSuccess={handleCreated} />

      <ConfirmDialog
        open={bulkConfirmOpen}
        title={`Nonaktifkan ${selectedIds.size} Cell Group terpilih?`}
        description="Cell Group dengan anggota aktif akan dilewati dan dilaporkan gagal — keluarkan anggotanya terlebih dahulu dari halaman detail masing-masing."
        confirmLabel="Ya, Nonaktifkan"
        isSubmitting={isBulkRunning}
        onOpenChange={setBulkConfirmOpen}
        onConfirm={handleConfirmBulkDeactivate}
      />

      <BulkActionSummaryDialog
        open={!!bulkResults}
        results={bulkResults}
        itemLabel={cgNameById}
        onOpenChange={(open) => !open && setBulkResults(null)}
      />
    </div>
  );
}