import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { toast } from '@/lib/toast';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/ErrorState';
import type { JemaatDependencies } from '@/types/jemaat.types';
import { deleteJemaat, getJemaatCellGroups, getJemaatEventHistory, getJemaatFull } from './jemaat.api';
import { listVolunteerByJemaat } from '@/features/volunteer/volunteer.api';
import StatusKeaktifanBadge from './components/StatusKeaktifanBadge';
import JemaatFormModal from './components/JemaatFormModal';
import DeleteJemaatDialog from './components/DeleteJemaatDialog';
import JemaatTimeline, { type TimelineEntry } from './components/JemaatTimeline';
import JemaatVolunteerSection from './components/JemaatVolunteerSection';
import Breadcrumb from '../../components/Breadcrumb';

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-slate-700">{value}</p>
    </div>
  );
}

export default function JemaatDetailPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = Number(idParam);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [dependencies, setDependencies] = useState<JemaatDependencies | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // staleTime 30s: tiap fetch /full memicu 1 baris audit log
  // VIEW_SENSITIVE â€” hindari refetch berlebihan tiap remount singkat.
  const fullQuery = useQuery({
    queryKey: ['jemaat', 'full', id],
    queryFn: () => getJemaatFull(id),
    staleTime: 30_000,
    enabled: Number.isFinite(id),
  });

  const cgQuery = useQuery({
    queryKey: ['jemaat', id, 'cell-groups'],
    queryFn: () => getJemaatCellGroups(id),
    enabled: Number.isFinite(id),
  });

  const eventQuery = useQuery({
    queryKey: ['jemaat', id, 'events'],
    queryFn: () => getJemaatEventHistory(id, { limit: 100 }),
    enabled: Number.isFinite(id),
  });

  const volunteerQuery = useQuery({
    queryKey: ['jemaat', id, 'volunteer'],
    queryFn: () => listVolunteerByJemaat(id),
    enabled: Number.isFinite(id),
  });

  const timelineEntries: TimelineEntry[] = useMemo(() => {
    const entries: TimelineEntry[] = [];
    cgQuery.data?.forEach((cg) =>
      entries.push({ id: `cg-${cg.id}`, date: cg.joined_at, type: 'cg', title: cg.nama, subtitle: 'Bergabung Cell Group' }),
    );
    eventQuery.data?.forEach((ev) =>
      entries.push({
        id: `event-${ev.id}`,
        date: ev.hadir_at,
        type: 'event',
        title: ev.judul,
        subtitle: `Menghadiri ${ev.jenis}`,
      }),
    );
    volunteerQuery.data?.forEach((v) =>
      entries.push({
        id: `vol-${v.id}`,
        date: v.joined_at,
        type: 'volunteer',
        title: v.nama,
        subtitle: 'Terdaftar sebagai volunteer',
      }),
    );
    return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [cgQuery.data, eventQuery.data, volunteerQuery.data]);

  const timelineLoading = cgQuery.isLoading || eventQuery.isLoading || volunteerQuery.isLoading;

  function refreshDetail() {
    queryClient.invalidateQueries({ queryKey: ['jemaat', 'full', id] });
    queryClient.invalidateQueries({ queryKey: ['jemaat', 'list-all'] });
  }

  async function handleConfirmDelete() {
    setIsDeleting(true);
    try {
      await deleteJemaat(id);
      toast.success('Jemaat berhasil dihapus');
      queryClient.invalidateQueries({ queryKey: ['jemaat', 'list-all'] });
      navigate('/jemaat');
    } catch (err) {
      if (
        isAxiosError<{ detail?: JemaatDependencies }>(err) &&
        err.response?.status === 409 &&
        err.response.data?.detail
      ) {
        setDependencies(err.response.data.detail);
      } else {
        toast.error('Gagal menghapus jemaat');
        setDeleteOpen(false);
      }
    } finally {
      setIsDeleting(false);
    }
  }

  if (!Number.isFinite(id)) {
    return <ErrorState message="ID jemaat tidak valid." />;
  }

  if (fullQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (fullQuery.isError || !fullQuery.data) {
    return (
      <ErrorState
        message="Gagal memuat data jemaat, atau jemaat tidak ditemukan."
        action={
          <Button variant="outline" size="sm" onClick={() => navigate('/jemaat')}>
            <ArrowLeft className="h-4 w-4" /> Kembali ke daftar
          </Button>
        }
      />
    );
  }

  const jemaat = fullQuery.data;

  return (
    <div className="space-y-4">
      <Breadcrumb
        segments={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Jemaat', href: '/jemaat' },
          { label: jemaat.nama },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link to="/jemaat" className="text-slate-400 hover:text-slate-600">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-800">{jemaat.nama}</h1>
            <div className="mt-1 flex items-center gap-2">
              <StatusKeaktifanBadge status={jemaat.status_keaktifan} />
              {jemaat.is_new_member && (
                <span className="rounded-pill bg-modul-jemaat/15 px-2.5 py-1 text-xs font-medium text-modul-jemaat">
                  Jemaat Baru
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              setDependencies(null);
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4" /> Hapus
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Informasi Jemaat</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Tanggal Lahir" value={formatDate(jemaat.tgl_lahir)} />
            <Field
              label="Jenis Kelamin"
              value={jemaat.jenis_kelamin === 'L' ? 'Laki-laki' : jemaat.jenis_kelamin === 'P' ? 'Perempuan' : jemaat.jenis_kelamin}
            />
            <Field label="Tanggal Bergabung" value={jemaat.tgl_bergabung ? formatDate(jemaat.tgl_bergabung) : '-'} />
            <Field label="Skor Keaktifan" value={jemaat.skor_keaktifan?.toString() ?? '-'} />
            <Field label="No. HP" value={jemaat.no_hp || '-'} />
            <Field label="Alamat" value={jemaat.alamat || '-'} />
            <Field label="Cell Group" value={jemaat.is_non_cg ? 'Belum ikut Cell Group' : 'Sudah ikut Cell Group'} />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Media Sosial</p>
              {jemaat.media_sosial && Object.keys(jemaat.media_sosial).length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
                  {Object.entries(jemaat.media_sosial).map(([k, v]) => (
                    <li key={k}>
                      <span className="capitalize text-slate-500">{k}:</span> {v}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-slate-700">-</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Timeline Aktivitas</CardTitle>
          </CardHeader>
          <CardContent>
            <JemaatTimeline entries={timelineEntries} isLoading={timelineLoading} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Volunteer</CardTitle>
        </CardHeader>
        <CardContent>
          <JemaatVolunteerSection jemaatId={id} />
        </CardContent>
      </Card>

      <JemaatFormModal open={editOpen} onOpenChange={setEditOpen} mode="edit" jemaat={jemaat} onSuccess={refreshDetail} />

      <DeleteJemaatDialog
        open={deleteOpen}
        dependencies={dependencies}
        isDeleting={isDeleting}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDependencies(null);
        }}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}