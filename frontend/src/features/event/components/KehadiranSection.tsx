import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { ClipboardCheck, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { getKehadiran, submitKehadiran } from '../event.api';
import type { EventStatus } from '@/types/event.types';

interface KehadiranSectionProps {
  eventId: number;
  eventStatus: EventStatus;
}

export default function KehadiranSection({ eventId, eventStatus }: KehadiranSectionProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [totalHadir, setTotalHadir] = useState('');
  const [jemaatBaru, setJemaatBaru] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const kehadiranQuery = useQuery({
    queryKey: ['event', eventId, 'kehadiran'],
    queryFn: () => getKehadiran(eventId),
  });

  const canSubmit = eventStatus === 'AKTIF' || eventStatus === 'SELESAI';

  function openForm() {
    setTotalHadir(String(kehadiranQuery.data?.total_hadir ?? ''));
    setJemaatBaru(String(kehadiranQuery.data?.jemaat_baru ?? 0));
    setIsEditing(true);
  }

  async function handleSubmit() {
    const total = Number(totalHadir);
    const baru = Number(jemaatBaru || 0);
    if (!Number.isFinite(total) || total < 0) {
      toast.error('Total hadir harus berupa angka non-negatif');
      return;
    }
    if (baru < 0 || baru > total) {
      toast.error('Jemaat baru tidak boleh melebihi total hadir');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitKehadiran(eventId, { total_hadir: total, jemaat_baru: baru });
      toast.success('Kehadiran berhasil disimpan');
      queryClient.invalidateQueries({ queryKey: ['event', eventId, 'kehadiran'] });
      setIsEditing(false);
    } catch {
      toast.error('Gagal menyimpan kehadiran');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (kehadiranQuery.isLoading) {
    return <Skeleton className="h-20 rounded-card" />;
  }

  const data = kehadiranQuery.data;

  // 200 (sudah pernah diinput) + tidak sedang mode edit -> ringkasan read-only
  if (data && !isEditing) {
    return (
      <div className="rounded-card border border-slate-200 p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 text-status-aktifText">
            <ClipboardCheck className="h-4 w-4" />
            <p className="text-sm font-medium">Kehadiran sudah diinput</p>
          </div>
          <Button size="sm" variant="outline" onClick={openForm} disabled={!canSubmit}>
            <Pencil className="h-3.5 w-3.5" /> Ubah
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Total Hadir</p>
            <p className="mt-1 text-lg font-semibold text-slate-800">{data.total_hadir}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Jemaat Baru</p>
            <p className="mt-1 text-lg font-semibold text-slate-800">{data.jemaat_baru}</p>
          </div>
        </div>
      </div>
    );
  }

  // 404 (belum diinput) atau sedang mode "Ubah" -> form
  return (
    <div className="rounded-card border border-slate-200 p-4">
      {!canSubmit && (
        <p className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Kehadiran hanya bisa diinput saat event berstatus Aktif atau Selesai.
        </p>
      )}
      <fieldset disabled={!canSubmit || isSubmitting} className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="total_hadir">Total Hadir *</Label>
          <input
            id="total_hadir"
            type="number"
            min={0}
            value={totalHadir}
            onChange={(e) => setTotalHadir(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <div>
          <Label htmlFor="jemaat_baru">Jemaat Baru</Label>
          <input
            id="jemaat_baru"
            type="number"
            min={0}
            value={jemaatBaru}
            onChange={(e) => setJemaatBaru(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </fieldset>
      <div className="mt-4 flex justify-end gap-2">
        {isEditing && (
          <Button variant="outline" onClick={() => setIsEditing(false)} disabled={isSubmitting}>
            Batal
          </Button>
        )}
        <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting || !totalHadir}>
          {isSubmitting ? 'Menyimpan...' : 'Simpan Kehadiran'}
        </Button>
      </div>
    </div>
  );
}