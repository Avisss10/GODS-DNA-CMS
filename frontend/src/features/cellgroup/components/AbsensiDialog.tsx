import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getActiveMembersAtMeetingTime, submitAbsensi } from '../cellgroup.api';
import type { ActiveMemberAtMeeting } from '@/types/cellgroup.types';

interface AbsensiDialogProps {
  open: boolean;
  meetingId: number;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// Tidak ada endpoint baca ulang absensi tersimpan (kontrak backend hanya
// expose submit, bukan GET) — jadi tiap dialog dibuka, semua anggota
// direset default "tidak hadir". Backend upsert (ON DUPLICATE KEY UPDATE)
// sehingga form ini boleh dibuka berkali-kali untuk revisi.
export default function AbsensiDialog({ open, meetingId, onOpenChange, onSuccess }: AbsensiDialogProps) {
  const [members, setMembers] = useState<ActiveMemberAtMeeting[]>([]);
  const [hadirMap, setHadirMap] = useState<Record<number, boolean>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    setLoadError(false);
    getActiveMembersAtMeetingTime(meetingId)
      .then((data) => {
        setMembers(data);
        const initial: Record<number, boolean> = {};
        data.forEach((m) => (initial[m.id] = false));
        setHadirMap(initial);
      })
      .catch(() => setLoadError(true))
      .finally(() => setIsLoading(false));
  }, [open, meetingId]);

  function toggle(jemaatId: number) {
    setHadirMap((prev) => ({ ...prev, [jemaatId]: !prev[jemaatId] }));
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      const absensi = members.map((m) => ({ jemaatId: m.id, hadir: !!hadirMap[m.id] }));
      await submitAbsensi(meetingId, absensi);
      toast.success('Absensi berhasil disimpan');
      onSuccess();
      onOpenChange(false);
    } catch {
      toast.error('Gagal menyimpan absensi');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Input Absensi</DialogTitle>
          <DialogDescription>
            Tandai jemaat yang hadir. Anggota yang tidak ditandai otomatis dianggap tidak hadir.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat anggota...
          </div>
        )}

        {!isLoading && loadError && (
          <p className="py-4 text-center text-sm text-destructive">Gagal memuat daftar anggota.</p>
        )}

        {!isLoading && !loadError && members.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-500">Tidak ada anggota pada saat meeting ini.</p>
        )}

        {!isLoading && !loadError && members.length > 0 && (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {members.map((m) => (
              <li key={m.id}>
                <label className="flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm hover:bg-slate-50">
                  <span>{m.nama}</span>
                  <input
                    type="checkbox"
                    checked={!!hadirMap[m.id]}
                    onChange={() => toggle(m.id)}
                    className="h-4 w-4"
                  />
                </label>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || isLoading || members.length === 0}>
            {isSubmitting ? 'Menyimpan...' : 'Simpan Absensi'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}