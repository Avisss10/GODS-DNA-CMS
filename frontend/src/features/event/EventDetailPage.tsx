import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getEventById, updateEventStatus } from './event.api';
import { formatEventDate, getEventStatusVariant, getValidNextStatuses } from './event.utils';
import type { EventStatus } from '@/types/event.types';
import EventFormModal from './components/EventFormModal';
import StatusPipeline from './components/StatusPipeline';
import StatusTransitionDialog from './components/StatusTransitionDialog';
import VolunteerNeedsSection from './components/VolunteerNeedsSection';
import VolunteerAssignmentSection from './components/VolunteerAssignmentSection';
import KehadiranSection from './components/KehadiranSection';

export default function EventDetailPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = Number(idParam);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState<EventStatus | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const eventQuery = useQuery({
    queryKey: ['event', 'detail', id],
    queryFn: () => getEventById(id),
    enabled: Number.isFinite(id),
  });

  const event = eventQuery.data;

  function refreshDetail() {
    queryClient.invalidateQueries({ queryKey: ['event', 'detail', id] });
    queryClient.invalidateQueries({ queryKey: ['event', 'list'] });
  }

  async function handleConfirmTransition() {
    if (!event || !transitionTarget) return;
    setIsTransitioning(true);
    try {
      await updateEventStatus(event.id, transitionTarget);
      toast.success(`Status event berhasil diubah menjadi ${transitionTarget}`);
      refreshDetail();
      setTransitionTarget(null);
    } catch {
      toast.error('Gagal mengubah status event');
    } finally {
      setIsTransitioning(false);
    }
  }

  if (!Number.isFinite(id)) {
    return <p className="text-sm text-destructive">ID Event tidak valid.</p>;
  }

  if (eventQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (eventQuery.isError || !event) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">Gagal memuat data Event, atau Event tidak ditemukan.</p>
        <Button variant="outline" onClick={() => navigate('/event')}>
          <ArrowLeft className="h-4 w-4" /> Kembali ke daftar
        </Button>
      </div>
    );
  }

  const variant = getEventStatusVariant(event.status);
  const canEdit = event.status === 'DRAFT' || event.status === 'PUBLISHED';
  const validNextStatuses = getValidNextStatuses(event.status);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link to="/event" className="text-slate-400 hover:text-slate-600">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-800">{event.judul}</h1>
            <div className="mt-1 flex items-center gap-2">
              <Badge className={variant.className}>{variant.label}</Badge>
              <span className="text-xs font-medium uppercase tracking-wide text-modul-event">{event.jenis}</span>
            </div>
          </div>
        </div>

        {/* Tombol Edit hanya render/aktif saat status DRAFT/PUBLISHED — instruksi Tahap 6 */}
        <Button variant="outline" onClick={() => setEditOpen(true)} disabled={!canEdit}>
          <Pencil className="h-4 w-4" /> Edit
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informasi Event</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Waktu Mulai</p>
            <p className="mt-1 text-sm text-slate-700">{formatEventDate(event.waktu_mulai)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Waktu Selesai</p>
            <p className="mt-1 text-sm text-slate-700">{formatEventDate(event.waktu_selesai)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Status Absensi</p>
            <p className="mt-1 text-sm text-slate-700">{event.absensi_status === 'OPEN' ? 'Terbuka' : 'Tertutup'}</p>
          </div>
          <div className="sm:col-span-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Deskripsi</p>
            <p className="mt-1 text-sm text-slate-700">{event.deskripsi || '-'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status Event</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <StatusPipeline currentStatus={event.status} />
          {validNextStatuses.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {validNextStatuses.map((s) => (
                <Button key={s} size="sm" onClick={() => setTransitionTarget(s)}>
                  Ubah ke {s}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Event sudah berada di status akhir (Diarsipkan).</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kebutuhan Volunteer</CardTitle>
        </CardHeader>
        <CardContent>
          <VolunteerNeedsSection eventId={id} eventStatus={event.status} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Penugasan Volunteer</CardTitle>
        </CardHeader>
        <CardContent>
          <VolunteerAssignmentSection eventId={id} eventStatus={event.status} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kehadiran</CardTitle>
        </CardHeader>
        <CardContent>
          <KehadiranSection eventId={id} eventStatus={event.status} />
        </CardContent>
      </Card>

      <EventFormModal open={editOpen} onOpenChange={setEditOpen} mode="edit" event={event} onSuccess={refreshDetail} />

      <StatusTransitionDialog
        open={!!transitionTarget}
        fromStatus={event.status}
        toStatus={transitionTarget}
        isSubmitting={isTransitioning}
        onOpenChange={(v) => !v && setTransitionTarget(null)}
        onConfirm={handleConfirmTransition}
      />
    </div>
  );
}