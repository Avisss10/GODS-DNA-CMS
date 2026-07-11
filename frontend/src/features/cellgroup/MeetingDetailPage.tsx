import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from '@/lib/toast';
import { ArrowLeft, CalendarClock, CheckCircle2, ClipboardList, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/store/auth.store';
import { deletePhoto, getAbsensi, getMeetingById, listMeetingPhotos } from './cellgroup.api';
import MeetingFormModal from './components/MeetingFormModal';
import PhotoThumbnail from './components/PhotoThumbnail';
import MeetingReportDialog from './components/MeetingReportDialog';
import Breadcrumb from '../../components/Breadcrumb';

const MAX_PHOTOS = 5;

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MeetingDetailPage() {
  const { meetingId: meetingIdParam } = useParams<{ meetingId: string }>();
  const meetingId = Number(meetingIdParam);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const peran = useAuthStore((s) => s.peran);

  const [editOpen, setEditOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const meetingQuery = useQuery({
    queryKey: ['cellgroup', 'meeting', meetingId],
    queryFn: () => getMeetingById(meetingId),
    enabled: Number.isFinite(meetingId),
  });

  const photosQuery = useQuery({
    queryKey: ['cellgroup', 'meeting', meetingId, 'photos'],
    queryFn: () => listMeetingPhotos(meetingId),
    enabled: Number.isFinite(meetingId),
  });

  const absensiQuery = useQuery({
    queryKey: ['cellgroup', 'meeting', meetingId, 'absensi'],
    queryFn: () => getAbsensi(meetingId),
    enabled: Number.isFinite(meetingId),
  });

  const photoCount = photosQuery.data?.length ?? 0;
  const hasReport = photoCount > 0 || (absensiQuery.data?.length ?? 0) > 0;
  const meetingEnded = meetingQuery.data ? new Date() > new Date(meetingQuery.data.waktu_selesai) : false;
  const isLeader = peran === 'LEADER';

  function refetchReport() {
    queryClient.invalidateQueries({ queryKey: ['cellgroup', 'meeting', meetingId, 'photos'] });
    queryClient.invalidateQueries({ queryKey: ['cellgroup', 'meeting', meetingId, 'absensi'] });
    if (meetingQuery.data) {
      queryClient.invalidateQueries({ queryKey: ['cellgroup', meetingQuery.data.cg_id, 'meetings'] });
    }
  }

  async function handleConfirmDeletePhoto() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deletePhoto(deleteTarget);
      toast.success('Foto berhasil dihapus');
      setDeleteTarget(null);
      refetchReport();
    } catch {
      toast.error('Gagal menghapus foto');
    } finally {
      setIsDeleting(false);
    }
  }

  if (!Number.isFinite(meetingId)) {
    return <ErrorState message="ID meeting tidak valid." />;
  }

  if (meetingQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (meetingQuery.isError || !meetingQuery.data) {
    return (
      <ErrorState
        message="Gagal memuat data meeting, atau meeting tidak ditemukan."
        action={
          <Button variant="outline" size="sm" onClick={() => navigate('/cellgroup')}>
            <ArrowLeft className="h-4 w-4" /> Kembali
          </Button>
        }
      />
    );
  }

  const meeting = meetingQuery.data;

  // Tombol laporan: belum selesai -> nonaktif dengan keterangan. Sudah
  // selesai & belum ada laporan -> aktif untuk ADMIN maupun LEADER. Sudah
  // ada laporan -> ADMIN tidak dapat tombol sama sekali (read-only total),
  // LEADER dapat tombol "Edit Laporan Meeting".
  const showReportButton = meetingEnded && (!hasReport || isLeader);
  const reportButtonLabel = !meetingEnded
    ? 'Tersedia setelah meeting selesai'
    : hasReport
      ? 'Edit Laporan Meeting'
      : 'Laporkan Meeting';

  return (
    <div className="space-y-4">
      <Breadcrumb
        segments={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Cell Group', href: '/cellgroup' },
          { label: 'Detail Cell Group', href: `/cellgroup/${meeting.cg_id}` },
          { label: meeting.judul },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link to={`/cellgroup/${meeting.cg_id}`} className="text-slate-400 hover:text-slate-600">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-800">{meeting.judul}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{meeting.jenis}</Badge>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <CalendarClock className="h-3.5 w-3.5" /> {formatDateTime(meeting.waktu_mulai)} —{' '}
                {formatDateTime(meeting.waktu_selesai)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          {showReportButton && (
            <Button disabled={!meetingEnded} onClick={() => setReportOpen(true)}>
              <ClipboardList className="h-4 w-4" /> {reportButtonLabel}
            </Button>
          )}
        </div>
      </div>

      {meeting.catatan && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Catatan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-700">{meeting.catatan}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Absensi Tersimpan</CardTitle>
        </CardHeader>
        <CardContent>
          {absensiQuery.isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 rounded-card" />
              ))}
            </div>
          )}

          {!absensiQuery.isLoading && (absensiQuery.data?.length ?? 0) === 0 && (
            <EmptyState icon={ClipboardList} title="Belum ada absensi tersimpan" className="py-6" />
          )}

          {!absensiQuery.isLoading && (absensiQuery.data?.length ?? 0) > 0 && (
            <ul className="divide-y divide-slate-100 rounded-card border border-slate-200">
              {absensiQuery.data!.map((a) => (
                <li key={a.jemaat_id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-slate-700">{a.nama}</span>
                  {a.hadir ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-status-aktifText">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Hadir
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-slate-400">Tidak Hadir</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Galeri Foto</CardTitle>
          <span className="text-sm text-slate-500">
            {photoCount}/{MAX_PHOTOS} foto
          </span>
        </CardHeader>
        <CardContent className="space-y-3">
          {photosQuery.isLoading && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-card" />
              ))}
            </div>
          )}

          {!photosQuery.isLoading && photoCount === 0 && (
            <EmptyState icon={ClipboardList} title="Belum ada foto dokumentasi" className="py-8" />
          )}

          {!photosQuery.isLoading && photoCount > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {photosQuery.data!.map((p) => (
                <PhotoThumbnail
                  key={p.id}
                  photoId={p.id}
                  onClick={setLightboxUrl}
                  onDelete={() => setDeleteTarget(p.id)}
                  isDeleting={isDeleting && deleteTarget === p.id}
                  canDelete={isLeader}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <MeetingFormModal
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        meeting={meeting}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['cellgroup', 'meeting', meetingId] })}
      />

      <MeetingReportDialog
        open={reportOpen}
        meetingId={meetingId}
        existingPhotoCount={photoCount}
        onOpenChange={setReportOpen}
        onSuccess={refetchReport}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Foto?</DialogTitle>
            <DialogDescription>Foto ini akan dihapus permanen dari server.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              Batal
            </Button>
            <Button variant="destructive" onClick={handleConfirmDeletePhoto} disabled={isDeleting}>
              {isDeleting ? 'Menghapus...' : 'Ya, Hapus'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm"
          onClick={() => setLightboxUrl(null)}
        >
          <button className="absolute right-4 top-4 text-white" onClick={() => setLightboxUrl(null)} aria-label="Tutup">
            <X className="h-6 w-6" />
          </button>
          <img
            src={lightboxUrl}
            alt="Foto meeting besar"
            className="max-h-full max-w-full rounded-card object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
