import { useRef, useState, type ChangeEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from '@/lib/toast';
import { ArrowLeft, CalendarClock, ClipboardList, ImagePlus, Loader2, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { deletePhoto, getMeetingById, listMeetingPhotos, uploadMeetingPhoto } from './cellgroup.api';
import MeetingFormModal from './components/MeetingFormModal';
import PhotoThumbnail from './components/PhotoThumbnail';
import AbsensiDialog from './components/AbsensiDialog';
import Breadcrumb from '../../components/Breadcrumb';

const MAX_PHOTOS = 5;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [absensiOpen, setAbsensiOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
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

  const photoCount = photosQuery.data?.length ?? 0;
  const isFull = photoCount >= MAX_PHOTOS;

  function refetchPhotos() {
    queryClient.invalidateQueries({ queryKey: ['cellgroup', 'meeting', meetingId, 'photos'] });
    if (meetingQuery.data) {
      queryClient.invalidateQueries({ queryKey: ['cellgroup', meetingQuery.data.cg_id, 'meetings'] });
    }
  }

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset supaya file yang sama bisa dipilih lagi
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Tipe file tidak didukung. Hanya JPEG, PNG, atau WebP');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Ukuran file terlalu besar (maksimal 10MB)');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    try {
      await uploadMeetingPhoto(meetingId, file, setUploadProgress);
      toast.success('Foto berhasil diunggah');
      refetchPhotos();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(message || 'Gagal mengunggah foto');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }

  async function handleConfirmDeletePhoto() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deletePhoto(deleteTarget);
      toast.success('Foto berhasil dihapus');
      setDeleteTarget(null);
      refetchPhotos();
    } catch {
      toast.error('Gagal menghapus foto');
    } finally {
      setIsDeleting(false);
    }
  }

  if (!Number.isFinite(meetingId)) {
    return <p className="text-sm text-destructive">ID meeting tidak valid.</p>;
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
      <div className="space-y-3">
        <p className="text-sm text-destructive">Gagal memuat data meeting, atau meeting tidak ditemukan.</p>
        <Button variant="outline" onClick={() => navigate('/cellgroup')}>
          <ArrowLeft className="h-4 w-4" /> Kembali
        </Button>
      </div>
    );
  }

  const meeting = meetingQuery.data;

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
                <CalendarClock className="h-3.5 w-3.5" /> {formatDateTime(meeting.waktu_mulai)} â€”{' '}
                {formatDateTime(meeting.waktu_selesai)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          <Button onClick={() => setAbsensiOpen(true)}>
            <ClipboardList className="h-4 w-4" /> Input Absensi
          </Button>
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
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Galeri Foto</CardTitle>
          <span className="text-sm text-slate-500">
            {photoCount}/{MAX_PHOTOS} foto
          </span>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileSelected}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={isFull || isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {isFull ? 'Kuota foto penuh (5/5)' : isUploading ? `Mengunggah ${uploadProgress}%` : 'Unggah Foto'}
          </Button>

          {isUploading && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-modul-cellgroup transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}

          {photosQuery.isLoading && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-card bg-slate-100" />
              ))}
            </div>
          )}

          {!photosQuery.isLoading && photoCount === 0 && (
            <p className="rounded-card border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
              Belum ada foto dokumentasi
            </p>
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

      <AbsensiDialog open={absensiOpen} meetingId={meetingId} onOpenChange={setAbsensiOpen} onSuccess={() => {}} />

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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
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