import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import JemaatSearchSelect from '@/features/cellgroup/components/JemaatSearchSelect';
import { listVolunteerTypeMembers, replaceVolunteer } from '../event.api';
import type { EventVolunteer, ReplacementTiming } from '@/types/event.types';

interface ReplaceVolunteerModalProps {
  open: boolean;
  eventId: number;
  assignment: EventVolunteer | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function ReplaceVolunteerModal({
  open,
  eventId,
  assignment,
  onOpenChange,
  onSuccess,
}: ReplaceVolunteerModalProps) {
  const [timing, setTiming] = useState<ReplacementTiming>('SEBELUM_EVENT');
  const [penggantiId, setPenggantiId] = useState<number | null>(null);
  const [alasan, setAlasan] = useState('');
  const [durasiMenit, setDurasiMenit] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const membersQuery = useQuery({
    queryKey: ['volunteer-type', assignment?.jenis_id, 'members'],
    queryFn: () => listVolunteerTypeMembers(assignment!.jenis_id),
    enabled: open && !!assignment,
  });

  function resetAndClose() {
    setTiming('SEBELUM_EVENT');
    setPenggantiId(null);
    setAlasan('');
    setDurasiMenit('');
    onOpenChange(false);
  }

  async function handleSubmit() {
    if (!assignment || !penggantiId) return;
    if (!alasan.trim()) {
      toast.error('Alasan penggantian wajib diisi');
      return;
    }
    if (timing === 'TENGAH_EVENT' && (!durasiMenit || Number(durasiMenit) < 1)) {
      toast.error('Durasi bertugas (menit) wajib diisi untuk penggantian tengah event');
      return;
    }

    setIsSubmitting(true);
    try {
      await replaceVolunteer(eventId, assignment.id, {
        replacement_timing: timing,
        replaced_by: penggantiId,
        alasan: alasan.trim(),
        durasi_menit: timing === 'TENGAH_EVENT' ? Number(durasiMenit) : undefined,
      });
      toast.success('Volunteer berhasil digantikan');
      onSuccess();
      resetAndClose();
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409) {
        toast.error(err.response.data?.message ?? 'Jemaat pengganti sudah ditugaskan pada jenis ini');
      } else {
        toast.error(isAxiosError(err) ? err.response?.data?.message ?? 'Gagal menggantikan volunteer' : 'Gagal menggantikan volunteer');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!assignment) return null;

  const options = (membersQuery.data ?? [])
    .filter((m) => m.jemaat_id !== assignment.jemaat_id)
    .map((m) => ({ id: m.jemaat_id, label: m.nama, sublabel: m.is_new_member ? 'Jemaat baru' : m.status_keaktifan }));

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : resetAndClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Gantikan Volunteer</DialogTitle>
          <DialogDescription>
            Menggantikan <span className="font-medium">{assignment.nama_jemaat}</span> ({assignment.nama_jenis})
          </DialogDescription>
        </DialogHeader>

        <fieldset disabled={isSubmitting} className="space-y-4">
          <div>
            <Label>Waktu Penggantian *</Label>
            <div className="mt-1.5 flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={timing === 'SEBELUM_EVENT'}
                  onChange={() => setTiming('SEBELUM_EVENT')}
                />
                Sebelum Event
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={timing === 'TENGAH_EVENT'}
                  onChange={() => setTiming('TENGAH_EVENT')}
                />
                Tengah Event
              </label>
            </div>
          </div>

          {timing === 'TENGAH_EVENT' && (
            <div>
              <Label htmlFor="durasi_menit">Durasi Bertugas (menit) *</Label>
              <input
                id="durasi_menit"
                type="number"
                min={1}
                value={durasiMenit}
                onChange={(e) => setDurasiMenit(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          )}

          <div>
            <Label>Jemaat Pengganti *</Label>
            <div className="mt-1">
              <JemaatSearchSelect
                options={options}
                value={penggantiId}
                onChange={setPenggantiId}
                isLoading={membersQuery.isLoading}
                placeholder="Cari jemaat pengganti..."
                emptyText="Tidak ada jemaat lain terdaftar untuk jenis ini"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="alasan">Alasan Penggantian *</Label>
            <textarea
              id="alasan"
              rows={3}
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              className="mt-1 flex w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </fieldset>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose} disabled={isSubmitting}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !penggantiId}>
            {isSubmitting ? 'Memproses...' : 'Gantikan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}