import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarDays, List, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import PrintButton from '@/components/PrintButton';
import Breadcrumb from '@/components/Breadcrumb';
import BulkActionToolbar from '@/components/BulkActionToolbar';
import BulkActionSummaryDialog from '@/components/BulkActionSummaryDialog';
import ConfirmDialog from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import SavedFiltersBar from '@/components/SavedFiltersBar';
import { useBulkAction, type BulkActionResult } from '@/hooks/useBulkAction';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import { cn } from '@/lib/utils';
import { listEvents, updateEventStatus } from './event.api';
import { formatEventDate, getEventStatusVariant } from './event.utils';
import type { EventStatus } from '@/types/event.types';
import EventFormModal from './components/EventFormModal';
import EventCalendar from './components/EventCalendar';

type ViewMode = 'list' | 'kalender';

interface EventSavedFilter {
  status: EventStatus | 'ALL';
  jenis: string;
  tanggal: string;
  search: string;
}

// Sesuai VALID_STATUS_TRANSITIONS di event.service.js backend: hanya
// PUBLISHED & SELESAI yang boleh berpindah ke DIARSIPKAN.
const ARCHIVABLE_STATUSES: EventStatus[] = ['PUBLISHED', 'SELESAI'];

const STATUS_FILTER_OPTIONS: { value: EventStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Semua Status' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'AKTIF', label: 'Aktif' },
  { value: 'SELESAI', label: 'Selesai' },
  { value: 'DIARSIPKAN', label: 'Diarsipkan' },
];

export default function EventListPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewMode>('list');
  const [formOpen, setFormOpen] = useState(false);

  const [statusFilter, setStatusFilter] = useState<EventStatus | 'ALL'>('ALL');
  const [jenisFilter, setJenisFilter] = useState('ALL');
  const [tanggalFilter, setTanggalFilter] = useState('');
  const [search, setSearch] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkActionResult[] | null>(null);
  const { run: runBulk, isRunning: isBulkRunning } = useBulkAction();

  const { savedFilters, save: saveFilter, remove: removeFilter } = useSavedFilters<EventSavedFilter>('event-list');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['event', 'list'],
    queryFn: () => listEvents(),
  });

  const jenisOptions = useMemo(() => {
    const set = new Set((data ?? []).map((e) => e.jenis));
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    return (data ?? []).filter((e) => {
      if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
      if (jenisFilter !== 'ALL' && e.jenis !== jenisFilter) return false;
      if (tanggalFilter) {
        const eventDate = new Date(e.waktu_mulai).toISOString().slice(0, 10);
        if (eventDate !== tanggalFilter) return false;
      }
      if (search.trim() && !e.judul.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [data, statusFilter, jenisFilter, tanggalFilter, search]);

  const archivableInView = useMemo(() => filtered.filter((e) => ARCHIVABLE_STATUSES.includes(e.status)), [filtered]);

  function handleCreated() {
    queryClient.invalidateQueries({ queryKey: ['event', 'list'] });
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllArchivable() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = archivableInView.length > 0 && archivableInView.every((e) => next.has(e.id));
      archivableInView.forEach((e) => (allSelected ? next.delete(e.id) : next.add(e.id)));
      return next;
    });
  }

  function applyFilter(filters: EventSavedFilter) {
    setStatusFilter(filters.status);
    setJenisFilter(filters.jenis);
    setTanggalFilter(filters.tanggal);
    setSearch(filters.search);
  }

  function eventTitleById(id: number): string {
    return data?.find((e) => e.id === id)?.judul ?? `#${id}`;
  }

async function handleConfirmBulkArchive() {
    const ids = Array.from(selectedIds);
    const results = await runBulk(ids, async (id) => {
      await updateEventStatus(id, 'DIARSIPKAN');
      return { message: 'Event berhasil diarsipkan' };
    });
    setBulkConfirmOpen(false);
    setBulkResults(results);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['event', 'list'] });
  }

  const isEmpty = !isLoading && !isError && (data?.length ?? 0) === 0;
  const hasActiveFilter = statusFilter !== 'ALL' || jenisFilter !== 'ALL' || !!tanggalFilter || !!search;

  return (
    <div className="space-y-4">
      <Breadcrumb segments={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Event' }]} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Event</h1>
          <p className="text-sm text-slate-500 print:hidden">Kelola event dan penugasan volunteer pelayanan</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <PrintButton />
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" />
            Buat Event
          </Button>
       </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="flex rounded-card border border-slate-200 p-0.5">
          <button
            type="button"
            onClick={() => setView('list')}
            className={cn(
              'flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-sm font-medium transition-smooth',
              view === 'list' ? 'bg-modul-event text-white' : 'text-slate-500 hover:bg-slate-50',
            )}
          >
            <List className="h-3.5 w-3.5" /> List
          </button>
          <button
            type="button"
            onClick={() => setView('kalender')}
            className={cn(
              'flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-sm font-medium transition-smooth',
              view === 'kalender' ? 'bg-modul-event text-white' : 'text-slate-500 hover:bg-slate-50',
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" /> Kalender
          </button>
        </div>

        {view === 'list' && (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari judul event..."
                className="w-48 pl-8"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as EventStatus | 'ALL')}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={jenisFilter}
              onChange={(e) => setJenisFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="ALL">Semua Jenis</option>
              {jenisOptions.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
            <Input type="date" value={tanggalFilter} onChange={(e) => setTanggalFilter(e.target.value)} className="w-40" />
            {hasActiveFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter('ALL');
                  setJenisFilter('ALL');
                  setTanggalFilter('');
                  setSearch('');
                }}
              >
                Reset Filter
              </Button>
            )}
          </>
        )}
      </div>

      {view === 'list' && (
        <SavedFiltersBar
          savedFilters={savedFilters}
          hasActiveFilter={hasActiveFilter}
          onSave={(name) =>
            saveFilter(name, { status: statusFilter, jenis: jenisFilter, tanggal: tanggalFilter, search })
          }
          onApply={applyFilter}
          onRemove={removeFilter}
        />
      )}

      {view === 'list' && archivableInView.length > 0 && (
        <label className="flex w-fit items-center gap-2 text-sm text-slate-600 print:hidden">
          <input
            type="checkbox"
            checked={archivableInView.every((e) => selectedIds.has(e.id))}
            onChange={toggleSelectAllArchivable}
          />
          Pilih semua yang bisa diarsipkan ({archivableInView.length})
        </label>
      )}

      <BulkActionToolbar
        count={selectedIds.size}
        actionLabel="Arsipkan Terpilih"
        onAction={() => setBulkConfirmOpen(true)}
        onClear={() => setSelectedIds(new Set())}
      />

      {isError && <ErrorState message="Gagal memuat data Event. Silakan muat ulang halaman." />}

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      )}

      {isEmpty && (
        <EmptyState
          icon={CalendarDays}
          title="Belum ada Event"
          action={
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" />
              Buat Event
            </Button>
          }
        />
      )}

      {!isLoading && !isEmpty && view === 'kalender' && <EventCalendar events={data ?? []} />}

      {!isLoading && !isEmpty && view === 'list' && (
        <>
          {filtered.length === 0 ? (
            <EmptyState icon={Search} title="Tidak ada event yang cocok dengan filter" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((ev) => {
                const variant = getEventStatusVariant(ev.status);
                const canArchive = ARCHIVABLE_STATUSES.includes(ev.status);
                return (
                  <Link
                    key={ev.id}
                    to={`/event/${ev.id}`}
                    className="relative block rounded-xl border-y border-r border-l-4 border-y-slate-200/70 border-r-slate-200/70 border-l-modul-event bg-card p-4 shadow-card transition-smooth hover:-translate-y-0.5 hover:shadow-card-hover"
                  >
                    <label
                      className="absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded bg-white/90 shadow print:hidden"
                      onClick={(e) => e.stopPropagation()}
                      title={canArchive ? 'Pilih untuk arsipkan massal' : 'Hanya event Published/Selesai yang bisa diarsipkan'}
                    >
                      <input
                        type="checkbox"
                        disabled={!canArchive}
                        checked={selectedIds.has(ev.id)}
                        onChange={() => toggleSelect(ev.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Pilih ${ev.judul}`}
                      />
                    </label>
                    <div className="flex items-start justify-between gap-2 pl-6">
                      <h3 className="font-semibold text-slate-800">{ev.judul}</h3>
                      <Badge className={variant.className}>{variant.label}</Badge>
                    </div>
                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-modul-eventText">{ev.jenis}</p>
                    <p className="mt-2 text-sm text-slate-500">{formatEventDate(ev.waktu_mulai)}</p>
                    {ev.deskripsi && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{ev.deskripsi}</p>}
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}

      <EventFormModal open={formOpen} onOpenChange={setFormOpen} mode="create" onSuccess={handleCreated} />

      <ConfirmDialog
        open={bulkConfirmOpen}
        title={`Arsipkan ${selectedIds.size} event terpilih?`}
        description="Event yang diarsipkan tidak bisa diubah statusnya lagi. Hanya event berstatus Published/Selesai yang diproses."
        confirmLabel="Ya, Arsipkan"
        isSubmitting={isBulkRunning}
        onOpenChange={setBulkConfirmOpen}
        onConfirm={handleConfirmBulkArchive}
      />

      <BulkActionSummaryDialog
        open={!!bulkResults}
        results={bulkResults}
        itemLabel={eventTitleById}
        onOpenChange={(open) => !open && setBulkResults(null)}
      />
    </div>
  );
}