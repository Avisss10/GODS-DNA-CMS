import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarDays, List, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { listEvents } from './event.api';
import { formatEventDate, getEventStatusVariant } from './event.utils';
import type { EventStatus } from '@/types/event.types';
import EventFormModal from './components/EventFormModal';
import EventCalendar from './components/EventCalendar';

type ViewMode = 'list' | 'kalender';

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

  // Tanpa param status: ambil semua event, filter multi-kriteria di client
  // (lebih fleksibel utk kombinasi status+jenis+tanggal+search sekaligus).
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

  function handleCreated() {
    queryClient.invalidateQueries({ queryKey: ['event', 'list'] });
  }

  const isEmpty = !isLoading && !isError && (data?.length ?? 0) === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Event</h1>
          <p className="text-sm text-slate-500">Kelola event dan penugasan volunteer pelayanan</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" />
          Buat Event
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-card border border-slate-200 p-0.5">
          <button
            type="button"
            onClick={() => setView('list')}
            className={cn(
              'flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-sm font-medium',
              view === 'list' ? 'bg-modul-event text-white' : 'text-slate-500 hover:bg-slate-50',
            )}
          >
            <List className="h-3.5 w-3.5" /> List
          </button>
          <button
            type="button"
            onClick={() => setView('kalender')}
            className={cn(
              'flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-sm font-medium',
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
            <Input
              type="date"
              value={tanggalFilter}
              onChange={(e) => setTanggalFilter(e.target.value)}
              className="w-40"
            />
            {(statusFilter !== 'ALL' || jenisFilter !== 'ALL' || tanggalFilter || search) && (
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

      {isError && (
        <p className="rounded-card border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Gagal memuat data Event. Silakan muat ulang halaman.
        </p>
      )}

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-card bg-slate-100" />
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-slate-300 py-16 text-center">
          <CalendarDays className="h-10 w-10 text-slate-300" />
          <p className="font-medium text-slate-600">Belum ada Event</p>
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" />
            Buat Event
          </Button>
        </div>
      )}

      {!isLoading && !isEmpty && view === 'kalender' && <EventCalendar events={data ?? []} />}

      {!isLoading && !isEmpty && view === 'list' && (
        <>
          {filtered.length === 0 ? (
            <p className="rounded-card border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
              Tidak ada event yang cocok dengan filter.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((ev) => {
                const variant = getEventStatusVariant(ev.status);
                return (
                  <Link
                    key={ev.id}
                    to={`/event/${ev.id}`}
                    className="block rounded-card border border-slate-200 p-4 transition-shadow hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-slate-800">{ev.judul}</h3>
                      <Badge className={variant.className}>{variant.label}</Badge>
                    </div>
                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-modul-event">{ev.jenis}</p>
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
    </div>
  );
}