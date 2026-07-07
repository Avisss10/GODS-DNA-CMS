import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { Loader2, Plus, UserMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { listJemaat } from '@/features/jemaat/jemaat.api';
import { addMember, getActiveMembers, removeMember } from '../cellgroup.api';
import JemaatSearchSelect from './JemaatSearchSelect';

interface MembersSectionProps {
  cgId: number;
  onMembersChanged?: () => void; // dipakai parent untuk refetch CG detail (leader/jumlah anggota)
}

export default function MembersSection({ cgId, onMembersChanged }: MembersSectionProps) {
  const queryClient = useQueryClient();
  const [selectedJemaatId, setSelectedJemaatId] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ id: number; nama: string } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const membersQuery = useQuery({
    queryKey: ['cellgroup', cgId, 'members'],
    queryFn: () => getActiveMembers(cgId),
  });

  const jemaatQuery = useQuery({
    queryKey: ['jemaat', 'list-all-active'],
    queryFn: () => listJemaat({ limit: 500 }),
  });

  // Jemaat yang belum jadi anggota CG INI (validasi 409 "sudah anggota aktif
  // CG ini" tetap diandalkan dari backend kalau ada race condition).
  const memberIds = new Set((membersQuery.data ?? []).map((m) => m.id));
  const candidateOptions = (jemaatQuery.data ?? [])
    .filter((j) => j.is_active && !memberIds.has(j.id))
    .map((j) => ({ id: j.id, label: j.nama }));

  function refetchAll() {
    queryClient.invalidateQueries({ queryKey: ['cellgroup', cgId, 'members'] });
    onMembersChanged?.();
  }

  async function handleAdd() {
    if (!selectedJemaatId) {
      toast.error('Pilih jemaat terlebih dahulu');
      return;
    }
    setIsAdding(true);
    try {
      await addMember(cgId, selectedJemaatId);
      toast.success('Anggota berhasil ditambahkan');
      setSelectedJemaatId(null);
      refetchAll();
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409) {
        toast.error(err.response.data?.message ?? 'Jemaat sudah menjadi anggota aktif');
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
      await removeMember(cgId, removeTarget.id);
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
            emptyText="Semua jemaat aktif sudah jadi anggota, atau belum ada jemaat"
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
            <div key={i} className="h-12 animate-pulse rounded-card bg-slate-100" />
          ))}
        </div>
      )}

      {!membersQuery.isLoading && (membersQuery.data?.length ?? 0) === 0 && (
        <p className="rounded-card border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
          Belum ada anggota di Cell Group ini
        </p>
      )}

      {!membersQuery.isLoading && (membersQuery.data?.length ?? 0) > 0 && (
        <ul className="divide-y divide-slate-100 rounded-card border border-slate-200">
          {membersQuery.data!.map((m) => (
            <li key={m.id} className="flex items-center justify-between px-4 py-3 text-sm">
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
                onClick={() => setRemoveTarget({ id: m.id, nama: m.nama })}
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
              {removeTarget?.nama} akan dikeluarkan dari Cell Group ini. Data historis tetap tersimpan.
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