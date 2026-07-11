import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { toast } from '@/lib/toast';
import { Loader2, Plus, UserMinus, HandHeart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/EmptyState';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { listJemaat } from '@/features/jemaat/jemaat.api';
import { getVolunteerTypeMembers, registerVolunteer, unregisterVolunteer } from '../volunteer.api';
import JemaatSearchSelect from '@/features/cellgroup/components/JemaatSearchSelect';

interface VolunteerMembersSectionProps {
  volunteerTypeId: number;
  onMembersChanged?: () => void; // dipakai parent untuk refetch jumlah anggota di header
}

export default function VolunteerMembersSection({ volunteerTypeId, onMembersChanged }: VolunteerMembersSectionProps) {
  const queryClient = useQueryClient();
  const [selectedJemaatId, setSelectedJemaatId] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ jemaatId: number; nama: string } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const membersQuery = useQuery({
    queryKey: ['volunteer-types', volunteerTypeId, 'members'],
    queryFn: () => getVolunteerTypeMembers(volunteerTypeId),
  });

  const jemaatQuery = useQuery({
    queryKey: ['jemaat', 'list-all-active'],
    queryFn: () => listJemaat({ limit: 500 }),
  });

  // Jemaat yang belum terdaftar di jenis volunteer INI (validasi 409
  // "sudah terdaftar" tetap diandalkan dari backend kalau ada race condition).
  const memberJemaatIds = new Set((membersQuery.data ?? []).map((m) => m.jemaat_id));
  const candidateOptions = (jemaatQuery.data ?? [])
    .filter((j) => j.is_active && !memberJemaatIds.has(j.id))
    .map((j) => ({ id: j.id, label: j.nama }));

  function refetchAll() {
    queryClient.invalidateQueries({ queryKey: ['volunteer-types', volunteerTypeId, 'members'] });
    onMembersChanged?.();
  }

  async function handleAdd() {
    if (!selectedJemaatId) {
      toast.error('Pilih jemaat terlebih dahulu');
      return;
    }
    setIsAdding(true);
    try {
      await registerVolunteer(selectedJemaatId, volunteerTypeId);
      toast.success('Anggota berhasil ditambahkan');
      setSelectedJemaatId(null);
      refetchAll();
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409) {
        toast.error((err.response.data as { message?: string })?.message ?? 'Jemaat sudah terdaftar untuk jenis ini');
      } else if (isAxiosError(err) && err.response?.status === 400) {
        toast.error((err.response.data as { message?: string })?.message ?? 'Jemaat tidak aktif');
      } else {
        toast.error('Gagal menambahkan anggota');
      }
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setIsRemoving(true);
    try {
      await unregisterVolunteer(removeTarget.jemaatId, volunteerTypeId);
      toast.success('Anggota berhasil dikeluarkan');
      setRemoveTarget(null);
      refetchAll();
    } catch {
      toast.error('Gagal mengeluarkan anggota');
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex-1">
          <JemaatSearchSelect
            options={candidateOptions}
            value={selectedJemaatId}
            onChange={setSelectedJemaatId}
            isLoading={jemaatQuery.isLoading}
            placeholder="Pilih jemaat untuk ditambahkan..."
            emptyText="Semua jemaat aktif sudah terdaftar, atau belum ada jemaat"
          />
        </div>
        <Button onClick={handleAdd} disabled={isAdding || !selectedJemaatId}>
          {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Tambah Anggota
        </Button>
      </div>

      {membersQuery.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-card" />
          ))}
        </div>
      )}

      {!membersQuery.isLoading && (membersQuery.data?.length ?? 0) === 0 && (
        <EmptyState icon={HandHeart} title="Belum ada anggota di jenis volunteer ini" className="py-8" />
      )}

      {!membersQuery.isLoading && (membersQuery.data?.length ?? 0) > 0 && (
        <ul className="divide-y divide-slate-100 rounded-card border border-slate-200">
          {membersQuery.data!.map((m) => (
            <li key={m.jemaat_id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-slate-800">{m.nama}</p>
                <p className="text-xs text-slate-400">
                  Bergabung {new Date(m.joined_at).toLocaleDateString('id-ID')}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setRemoveTarget({ jemaatId: m.jemaat_id, nama: m.nama })}
              >
                <UserMinus className="h-4 w-4" /> Keluarkan
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keluarkan Anggota?</DialogTitle>
            <DialogDescription>
              {removeTarget?.nama} akan dikeluarkan dari jenis volunteer ini.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={isRemoving}>
              Batal
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={isRemoving}>
              {isRemoving ? 'Memproses...' : 'Ya, Keluarkan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
