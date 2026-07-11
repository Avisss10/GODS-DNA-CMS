import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { toast } from '@/lib/toast';
import { ArrowLeft, Pencil, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/ErrorState';
import PrintButton from '@/components/PrintButton';
import type { JemaatDependencies } from '@/types/jemaat.types';
import {
  deleteJemaat,
  getJemaatCgAttendanceHistory,
  getJemaatEventHistory,
  getJemaatFull,
  getJemaatVolunteerAssignments,
} from './jemaat.api';
import StatusKeaktifanBadge from './components/StatusKeaktifanBadge';
import JemaatFormModal from './components/JemaatFormModal';
import DeleteJemaatDialog from './components/DeleteJemaatDialog';
import JemaatTimeline, { type TimelineEntry } from './components/JemaatTimeline';
import JemaatVolunteerSection from './components/JemaatVolunteerSection';
import AddToCellGroupDialog from './components/AddToCellGroupDialog';
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
  const [addToCgOpen, setAddToCgOpen] = useState(false);

  // staleTime 30s: tiap fetch /full memicu 1 baris audit log
  // VIEW_SENSITIVE â€” hindari refetch berlebihan tiap remount singkat.
  const fullQuery = useQuery({
    queryKey: ['jemaat', 'full', id],
    queryFn: () => getJemaatFull(id),
    staleTime: 30_000,
    enabled: Number.isFinite(id),
  });

  // Timeline Aktivitas menampilkan aktivitas yang jadi landasan skor
  // keaktifan (hadir meeting CG, ditugaskan/hadir di event) — BUKAN
  // tanggal join CG/registrasi jenis volunteer (info itu ada di section
  // lain di halaman ini: field "Cell Group" & card "Volunteer" di bawah).
  const cgAttendanceQuery = useQuery({
    queryKey: ['jemaat', id, 'cg-attendance-history'],
    queryFn: () => getJemaatCgAttendanceHistory(id, { limit: 50 }),
    enabled: Number.isFinite(id),
  });

  const eventQuery = useQuery({
    queryKey: ['jemaat', id, 'events'],
    queryFn: () => getJemaatEventHistory(id, { limit: 100 }),
    enabled: Number.isFinite(id),
  });

  const volunteerAssignmentQuery = useQuery({
    queryKey: ['jemaat', id, 'volunteer-assignments'],
    queryFn: () => getJemaatVolunteerAssignments(id, { limit: 50 }),
    enabled: Number.isFinite(id),
  });

  const timelineEntries: TimelineEntry[] = useMemo(() => {
    const entries: TimelineEntry[] = [];
    cgAttendanceQuery.data?.forEach((cg) =>
      entries.push({
        id: `cg-att-${cg.meeting_id}`,
        date: cg.waktu_mulai,
        type: 'cg-attendance',
        title: cg.nama_cg,
        subtitle: `Hadir meeting: ${cg.judul}`,
      }),
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
    volunteerAssignmentQuery.data?.forEach((v) =>
      entries.push({
        id: `vol-assign-${v.id}`,
        date: v.waktu_mulai,
        type: 'volunteer-assigned',
        title: v.judul,
        subtitle: v.nama_jenis_volunteer,
        status: v.status,
      }),
    );

    // Sama persis dengan window "3 bulan" yang dipakai sistem scoring
    // keaktifan (backend/src/modules/scoring/scoring.service.js:111-113,
    // hitungSkorJemaat) — pengurangan 3 bulan kalender, bukan 90 hari
    // tetap, supaya konsisten dengan definisi yang sama.
    const since = new Date();
    since.setMonth(since.getMonth() - 3);

    return entries
      .filter((e) => new Date(e.date) >= since)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [cgAttendanceQuery.data, eventQuery.data, volunteerAssignmentQuery.data]);

  const timelineLoading = cgAttendanceQuery.isLoading || eventQuery.isLoading || volunteerAssignmentQuery.isLoading;

  function refreshDetail() {
    queryClient.invalidateQueries({ queryKey: ['jemaat', 'full', id] });
    queryClient.invalidateQueries({ queryKey: ['jemaat', 'list-all'] });
  }

  function handleAddedToCellGroup() {
    refreshDetail();
    queryClient.invalidateQueries({ queryKey: ['jemaat', id, 'cell-groups'] });
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
          <Link to="/jemaat" className="text-slate-400 hover:text-slate-600 print:hidden">
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

        <div className="flex flex-wrap gap-2 print:hidden">
          {jemaat.is_non_cg && (
            <Button variant="outline" onClick={() => setAddToCgOpen(true)}>
              <UserPlus className="h-4 w-4" /> Tambah ke Cell Group
            </Button>
          )}
          <PrintButton />
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
            <Field
              label="Cell Group"
              value={jemaat.is_non_cg ? 'Belum ikut Cell Group' : 'Sudah ikut Cell Group'}
            />
            {jemaat.leading_cell_groups.length > 0 && (
              <Field
                label="Leader Cell Group"
                value={jemaat.leading_cell_groups.map((cg) => cg.nama).join(', ')}
              />
            )}
            <Field label="Instagram" value={jemaat.media_sosial?.instagram || '-'} />
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

      <AddToCellGroupDialog
        open={addToCgOpen}
        onOpenChange={setAddToCgOpen}
        jemaatId={id}
        onSuccess={handleAddedToCellGroup}
      />

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