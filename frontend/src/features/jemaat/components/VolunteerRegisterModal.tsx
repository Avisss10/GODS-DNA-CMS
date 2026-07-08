import { useState } from 'react';
import { isAxiosError } from 'axios';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { registerVolunteer } from '@/features/volunteer/volunteer.api';
import type { VolunteerTypeListItem } from '@/types/volunteer.types';

interface VolunteerRegisterModalProps {
  open: boolean;
  jemaatId: number;
  options: VolunteerTypeListItem[]; // sudah difilter is_active=true & belum terdaftar
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function VolunteerRegisterModal({
  open,
  jemaatId,
  options,
  onOpenChange,
  onSuccess,
}: VolunteerRegisterModalProps) {
  const [selectedId, setSelectedId] = useState<number | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (selectedId === '') {
      toast.error('Pilih jenis volunteer terlebih dahulu');
      return;
    }
    setIsSubmitting(true);
    try {
      await registerVolunteer(jemaatId, Number(selectedId));
      toast.success('Jemaat berhasil didaftarkan sebagai volunteer');
      setSelectedId('');
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409) {
        toast.error('Jemaat sudah terdaftar untuk jenis volunteer ini');
      } else if (isAxiosError(err) && err.response?.status === 400) {
        toast.error('Jemaat nonaktif tidak bisa didaftarkan sebagai volunteer');
      } else {
        toast.error('Gagal mendaftarkan jemaat');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Daftarkan ke Jenis Volunteer</DialogTitle>
        </DialogHeader>

        {options.length === 0 ? (
          <p className="text-sm text-slate-500">
            Tidak ada jenis volunteer aktif yang tersedia untuk didaftarkan (semua sudah
            terdaftar atau belum ada jenis aktif).
          </p>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="volunteer-type-select">Jenis Volunteer *</Label>
            <select
              id="volunteer-type-select"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : '')}
              disabled={isSubmitting}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">-- Pilih jenis volunteer --</option>
              {options.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.nama}
                </option>
              ))}
            </select>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || options.length === 0}>
            {isSubmitting ? 'Mendaftarkan...' : 'Daftarkan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}