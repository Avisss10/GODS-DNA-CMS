import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { toast } from '@/lib/toast';
import { ArrowLeft, Pencil, PowerOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import PulsingDot from '@/components/PulsingDot';
import { getJemaatById } from '@/features/jemaat/jemaat.api';
import {
  activateCellGroup,
  deactivateCellGroup,
  getActiveMembers,
  getCellGroupById,
} from './cellgroup.api';
import CellGroupFormModal from './components/CellGroupFormModal';
import DeactivateCgDialog from './components/DeactivateCgDialog';
import MembersSection from './components/MembersSection';
import MeetingsSection from './components/MeetingsSection';
import Breadcrumb from '../../components/Breadcrumb';

type TabKey = 'anggota' | 'meeting';

export default function CellGroupDetailPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = Number(idParam);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [blockerMessage, setBlockerMessage] = useState<string | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [tab, setTab] = useState<TabKey>('anggota');

  const cgQuery = useQuery({
    queryKey: ['cellgroup', 'detail', id],
    queryFn: () => getCellGroupById(id),
    enabled: Number.isFinite(id),
  });

  const cg = cgQuery.data;

  // GET /cell-groups/:id TIDAK punya nama_leader/jumlah_anggota (lihat
  // catatan di cellgroup.types.ts) â€” ambil terpisah dari jemaat & members.
  const leaderQuery = useQuery({
    queryKey: ['jemaat', 'basic', cg?.leader_id],
    queryFn: () => getJemaatById(cg!.leader_id as number),
    enabled: !!cg?.leader_id,
  });

  const membersQuery = useQuery({
    queryKey: ['cellgroup', id, 'members'],
    queryFn: () => getActiveMembers(id),
    enabled: Number.isFinite(id),
  });

  const hasActiveLeader = !!leaderQuery.data && leaderQuery.data.is_active;

  function refreshDetail() {
    queryClient.invalidateQueries({ queryKey: ['cellgroup', 'detail', id] });
    queryClient.invalidateQueries({ queryKey: ['cellgroup', 'list'] });
    queryClient.invalidateQueries({ queryKey: ['cellgroup', id, 'members'] });
  }

  async function handleConfirmDeactivate() {
    setIsDeactivating(true);
    try {
      await deactivateCellGroup(id);
      queryClient.invalidateQueries({ queryKey: ['cellgroup', 'list'] });
      setDeactivateOpen(false);
      navigate('/cellgroup');

      // CG langsung 404 di GET /:id setelah nonaktif â€” satu-satunya jalan
      // reaktivasi adalah lewat toast aksi undo ini (keputusan yang sudah
      // disepakati di prompt), toast tidak auto-hilang cepat.
      toast('Cell Group dinonaktifkan', {
        duration: 20000,
        action: {
          label: 'Aktifkan Kembali',
          onClick: async () => {
            try {
              await activateCellGroup(id);
              toast.success('Cell Group berhasil diaktifkan kembali');
              queryClient.invalidateQueries({ queryKey: ['cellgroup', 'list'] });
              navigate(`/cellgroup/${id}`);
            } catch {
              toast.error('Gagal mengaktifkan kembali Cell Group');
            }
          },
        },
      });
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409) {
        setBlockerMessage(err.response.data?.message ?? 'Cell Group masih memiliki anggota aktif');
      } else {
        toast.error('Gagal menonaktifkan Cell Group');
        setDeactivateOpen(false);
      }
    } finally {
      setIsDeactivating(false);
    }
  }

  if (!Number.isFinite(id)) {
    return <p className="text-sm text-destructive">ID Cell Group tidak valid.</p>;
  }

  if (cgQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (cgQuery.isError || !cg) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">
          Gagal memuat data Cell Group, atau Cell Group tidak ditemukan/sudah nonaktif.
        </p>
        <Button variant="outline" onClick={() => navigate('/cellgroup')}>
          <ArrowLeft className="h-4 w-4" /> Kembali ke daftar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Breadcrumb
        segments={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Cell Group', href: '/cellgroup' },
          { label: cg.nama },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link to="/cellgroup" className="text-slate-400 hover:text-slate-600">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-800">{cg.nama}</h1>
            <Badge variant={cg.is_active ? 'default' : 'secondary'} className="mt-1 gap-1.5">
              {cg.is_active && <PulsingDot colorClass="bg-status-aktif" />}
              {cg.is_active ? 'Aktif' : 'Nonaktif'}
            </Badge>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              setBlockerMessage(null);
              setDeactivateOpen(true);
            }}
          >
            <PowerOff className="h-4 w-4" /> Nonaktifkan
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informasi Cell Group</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Leader</p>
            <p className="mt-1 text-sm text-slate-700">
              {leaderQuery.isLoading ? '...' : leaderQuery.data?.nama ?? '-'}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Jumlah Anggota</p>
            <p className="mt-1 text-sm text-slate-700">
              {membersQuery.isLoading ? '...' : membersQuery.data?.length ?? 0}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Dibuat</p>
            <p className="mt-1 text-sm text-slate-700">{new Date(cg.created_at).toLocaleDateString('id-ID')}</p>
          </div>
          <div className="sm:col-span-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Deskripsi</p>
            <p className="mt-1 text-sm text-slate-700">{cg.deskripsi || '-'}</p>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-card border border-slate-200">
        <div className="flex border-b border-slate-100">
          <button
            className={`px-4 py-3 text-sm font-medium ${
              tab === 'anggota' ? 'border-b-2 border-modul-cellgroup text-modul-cellgroupText' : 'text-slate-500'
            }`}
            onClick={() => setTab('anggota')}
          >
            Anggota
          </button>
          <button
            className={`px-4 py-3 text-sm font-medium ${
              tab === 'meeting' ? 'border-b-2 border-modul-cellgroup text-modul-cellgroupText' : 'text-slate-500'
            }`}
            onClick={() => setTab('meeting')}
          >
            Meeting
          </button>
        </div>
        <div className="p-4">
          {tab === 'anggota' && <MembersSection cgId={id} onMembersChanged={refreshDetail} />}
          {tab === 'meeting' && <MeetingsSection cgId={id} hasActiveLeader={hasActiveLeader} />}
        </div>
      </div>

      <CellGroupFormModal
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        cg={cg}
        currentLeaderName={leaderQuery.data?.nama ?? null}
        onSuccess={refreshDetail}
      />

      <DeactivateCgDialog
        open={deactivateOpen}
        blockerMessage={blockerMessage}
        isSubmitting={isDeactivating}
        onOpenChange={(open) => {
          setDeactivateOpen(open);
          if (!open) setBlockerMessage(null);
        }}
        onConfirm={handleConfirmDeactivate}
      />
    </div>
  );
}