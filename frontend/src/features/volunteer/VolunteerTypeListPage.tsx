import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { toast } from '@/lib/toast';
import { HandHeart, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  activateVolunteerType,
  deactivateVolunteerType,
  listVolunteerTypes,
} from './volunteer.api';
import type { VolunteerTypeListItem } from '@/types/volunteer.types';
import VolunteerTypeFormModal from './components/VolunteerTypeFormModal';
import DeactivateVolunteerTypeDialog from './components/DeactivateVolunteerTypeDialog';
import StatusToggleSwitch from './components/StatusToggleSwitch';
import { cn } from '@/lib/utils';

export default function VolunteerTypeListPage() {
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<VolunteerTypeListItem | null>(null);

  const [deactivateTarget, setDeactivateTarget] = useState<VolunteerTypeListItem | null>(null);
  const [isTogglingId, setIsTogglingId] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['volunteer-types', 'list'],
    queryFn: listVolunteerTypes,
  });

  function invalidateList() {
    queryClient.invalidateQueries({ queryKey: ['volunteer-types', 'list'] });
  }

  function handleCreated() {
    invalidateList();
  }

  function openEdit(item: VolunteerTypeListItem) {
    setEditItem(item);
    setFormOpen(true);
  }

  function openCreate() {
    setEditItem(null);
    setFormOpen(true);
  }

  // OFF -> ON: langsung tanpa dialog berat, cukup toast sukses.
  async function handleActivate(item: VolunteerTypeListItem) {
    setIsTogglingId(item.id);
    try {
      const res = await activateVolunteerType(item.id);
      toast.success(res.message);
      invalidateList();
    } catch (err) {
      if (isAxiosError<{ message?: string }>(err) && err.response?.status === 409) {
        toast.error(err.response.data?.message ?? 'Jenis volunteer sudah aktif');
      } else if (isAxiosError(err) && err.response?.status === 404) {
        toast.error('Jenis volunteer tidak ditemukan');
      } else {
        toast.error('Gagal mengaktifkan jenis volunteer');
      }
    } finally {
      setIsTogglingId(null);
    }
  }

  // ON -> OFF: lewat dialog konfirmasi (destruktif).
  async function handleConfirmDeactivate() {
    if (!deactivateTarget) return;
    setIsTogglingId(deactivateTarget.id);
    try {
      const res = await deactivateVolunteerType(deactivateTarget.id);
      toast.success(res.message);
      invalidateList();
      setDeactivateTarget(null);
    } catch {
      toast.error('Gagal menonaktifkan jenis volunteer');
    } finally {
      setIsTogglingId(null);
    }
  }

  function handleToggleClick(item: VolunteerTypeListItem) {
    if (item.is_active) {
      setDeactivateTarget(item);
    } else {
      handleActivate(item);
    }
  }

  const isEmpty = !isLoading && !isError && (data?.length ?? 0) === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Jenis Volunteer</h1>
          <p className="text-sm text-slate-500">Kelola jenis-jenis volunteer di gereja</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Tambah Jenis Volunteer
        </Button>
      </div>

      {isError && (
        <p className="rounded-card border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Gagal memuat data jenis volunteer. Silakan muat ulang halaman.
        </p>
      )}

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-card bg-slate-100" />
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-slate-300 py-16 text-center">
          <HandHeart className="h-10 w-10 text-slate-300" />
          <p className="font-medium text-slate-600">Belum ada jenis volunteer</p>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Tambah Jenis Volunteer
          </Button>
        </div>
      )}

      {!isLoading && !isEmpty && (
        <>
          {/* Desktop/tablet: tabel biasa, disembunyikan di mobile */}
          <div className="hidden overflow-x-auto rounded-card border border-slate-200 sm:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Nama</th>
                  <th className="px-4 py-3 font-medium">Deskripsi</th>
                  <th className="px-4 py-3 font-medium">Jumlah Anggota</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data!.map((item) => (
                  <tr
                    key={item.id}
                    className={cn('transition-opacity', !item.is_active && 'opacity-60')}
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">{item.nama}</td>
                    <td className="max-w-xs px-4 py-3 text-slate-600">
                      <span className="line-clamp-2">{item.deskripsi || '-'}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.jumlah_anggota}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StatusToggleSwitch
                          checked={item.is_active}
                          disabled={isTogglingId === item.id}
                          label={`Ubah status jenis volunteer ${item.nama}`}
                          onClick={() => handleToggleClick(item)}
                        />
                        <Badge variant={item.is_active ? 'default' : 'secondary'}>
                          {item.is_active ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="outline" size="sm" onClick={() => openEdit(item)}>
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: card-list, disembunyikan di tablet ke atas */}
          <div className="space-y-3 sm:hidden">
            {data!.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'rounded-card border border-slate-200 bg-card p-4 transition-opacity',
                  !item.is_active && 'opacity-60',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-slate-800">{item.nama}</p>
                  <Badge variant={item.is_active ? 'default' : 'secondary'} className="shrink-0">
                    {item.is_active ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </div>
                {item.deskripsi && (
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{item.deskripsi}</p>
                )}
                <p className="mt-2 text-xs text-slate-500">{item.jumlah_anggota} anggota</p>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-2">
                    <StatusToggleSwitch
                      checked={item.is_active}
                      disabled={isTogglingId === item.id}
                      label={`Ubah status jenis volunteer ${item.nama}`}
                      onClick={() => handleToggleClick(item)}
                    />
                    <span className="text-xs text-slate-500">Status</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openEdit(item)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <VolunteerTypeFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={editItem ? 'edit' : 'create'}
        item={editItem ?? undefined}
        onSuccess={handleCreated}
      />

      <DeactivateVolunteerTypeDialog
        open={!!deactivateTarget}
        namaJenis={deactivateTarget?.nama ?? null}
        isSubmitting={isTogglingId === deactivateTarget?.id}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
        onConfirm={handleConfirmDeactivate}
      />
    </div>
  );
}