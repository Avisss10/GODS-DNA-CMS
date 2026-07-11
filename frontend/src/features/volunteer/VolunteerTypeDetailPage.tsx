import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { toast } from '@/lib/toast';
import { ArrowLeft, Pencil, Power, PowerOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import ErrorState from '@/components/ErrorState';
import PulsingDot from '@/components/PulsingDot';
import { activateVolunteerType, deactivateVolunteerType, listVolunteerTypes } from './volunteer.api';
import VolunteerTypeFormModal from './components/VolunteerTypeFormModal';
import DeactivateVolunteerTypeDialog from './components/DeactivateVolunteerTypeDialog';
import VolunteerMembersSection from './components/VolunteerMembersSection';
import Breadcrumb from '../../components/Breadcrumb';

// Tidak ada GET /volunteer-types/:id tersendiri di backend — data jenis
// diambil dari cache list yang sudah ada (dicari by id), konsisten dengan
// query key yang dipakai VolunteerTypeListPage supaya cache-nya nyambung.
export default function VolunteerTypeDetailPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = Number(idParam);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  const typesQuery = useQuery({
    queryKey: ['volunteer-types', 'list'],
    queryFn: listVolunteerTypes,
    enabled: Number.isFinite(id),
  });

  const item = typesQuery.data?.find((t) => t.id === id);

  function refreshDetail() {
    queryClient.invalidateQueries({ queryKey: ['volunteer-types', 'list'] });
  }

  async function handleActivate() {
    if (!item) return;
    setIsToggling(true);
    try {
      const res = await activateVolunteerType(item.id);
      toast.success(res.message);
      refreshDetail();
    } catch (err) {
      if (isAxiosError<{ message?: string }>(err) && err.response?.data?.message) {
        toast.error(err.response.data.message);
      } else {
        toast.error('Gagal mengaktifkan jenis volunteer');
      }
    } finally {
      setIsToggling(false);
    }
  }

  async function handleConfirmDeactivate() {
    if (!item) return;
    setIsToggling(true);
    try {
      const res = await deactivateVolunteerType(item.id);
      toast.success(res.message);
      refreshDetail();
      setDeactivateOpen(false);
    } catch {
      toast.error('Gagal menonaktifkan jenis volunteer');
    } finally {
      setIsToggling(false);
    }
  }

  if (!Number.isFinite(id)) {
    return <ErrorState message="ID jenis volunteer tidak valid." />;
  }

  if (typesQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (typesQuery.isError || !item) {
    return (
      <ErrorState
        message="Gagal memuat data jenis volunteer, atau jenis volunteer tidak ditemukan."
        action={
          <Button variant="outline" size="sm" onClick={() => navigate('/volunteer')}>
            <ArrowLeft className="h-4 w-4" /> Kembali ke daftar
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <Breadcrumb
        segments={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Volunteer', href: '/volunteer' },
          { label: item.nama },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link to="/volunteer" className="text-slate-400 hover:text-slate-600">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-800">{item.nama}</h1>
            <Badge variant={item.is_active ? 'default' : 'secondary'} className="mt-1 gap-1.5">
              {item.is_active && <PulsingDot colorClass="bg-status-aktif" />}
              {item.is_active ? 'Aktif' : 'Nonaktif'}
            </Badge>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          {item.is_active ? (
            <Button variant="destructive" onClick={() => setDeactivateOpen(true)} disabled={isToggling}>
              <PowerOff className="h-4 w-4" /> Nonaktifkan
            </Button>
          ) : (
            <Button variant="outline" onClick={handleActivate} disabled={isToggling}>
              <Power className="h-4 w-4" /> Aktifkan
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informasi Jenis Volunteer</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Jumlah Anggota</p>
            <p className="mt-1 text-sm text-slate-700">{item.jumlah_anggota}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Deskripsi</p>
            <p className="mt-1 text-sm text-slate-700">{item.deskripsi || '-'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Anggota</CardTitle>
        </CardHeader>
        <CardContent>
          <VolunteerMembersSection volunteerTypeId={id} onMembersChanged={refreshDetail} />
        </CardContent>
      </Card>

      <VolunteerTypeFormModal
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        item={item}
        onSuccess={refreshDetail}
      />

      <DeactivateVolunteerTypeDialog
        open={deactivateOpen}
        namaJenis={item.nama}
        isSubmitting={isToggling}
        onOpenChange={setDeactivateOpen}
        onConfirm={handleConfirmDeactivate}
      />
    </div>
  );
}
