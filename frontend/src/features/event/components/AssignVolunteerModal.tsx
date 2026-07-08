import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { toast } from '@/lib/toast';
import { Sparkles, User } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import JemaatSearchSelect from '@/features/cellgroup/components/JemaatSearchSelect';
import { assignVolunteer, listVolunteerTypeMembers, suggestVolunteers } from '../event.api';

interface JenisOption {
  id: number;
  label: string;
}

interface AssignVolunteerModalProps {
  open: boolean;
  eventId: number;
  jenisOptions: JenisOption[];
  defaultJenisId?: number;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type Tab = 'manual' | 'suggest';

export default function AssignVolunteerModal({
  open,
  eventId,
  jenisOptions,
  defaultJenisId,
  onOpenChange,
  onSuccess,
}: AssignVolunteerModalProps) {
  const [jenisId, setJenisId] = useState<number | null>(defaultJenisId ?? jenisOptions[0]?.id ?? null);
  const [tab, setTab] = useState<Tab>('manual');
  const [selectedJemaatId, setSelectedJemaatId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const membersQuery = useQuery({
    queryKey: ['volunteer-type', jenisId, 'members'],
    queryFn: () => listVolunteerTypeMembers(jenisId as number),
    enabled: open && tab === 'manual' && !!jenisId,
  });

  const suggestQuery = useQuery({
    queryKey: ['event', eventId, 'suggest-volunteers', jenisId],
    queryFn: () => suggestVolunteers(eventId, jenisId as number),
    enabled: open && tab === 'suggest' && !!jenisId,
  });

  function resetAndClose() {
    setSelectedJemaatId(null);
    setTab('manual');
    onOpenChange(false);
  }

  async function submitAssign(jemaatId: number) {
    if (!jenisId) return;
    setIsSubmitting(true);
    try {
      await assignVolunteer(eventId, { jemaat_id: jemaatId, jenis_id: jenisId });
      toast.success('Volunteer berhasil ditugaskan');
      onSuccess();
      resetAndClose();
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409) {
        toast.error(err.response.data?.message ?? 'Kuota volunteer untuk jenis ini sudah penuh');
      } else if (isAxiosError(err) && err.response?.status === 400) {
        toast.error(err.response.data?.message ?? 'Jemaat tidak terdaftar untuk jenis volunteer ini');
      } else {
        toast.error('Terjadi kesalahan pada server, silakan coba lagi');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const manualOptions = (membersQuery.data ?? []).map((m) => ({
    id: m.jemaat_id,
    label: m.nama,
    sublabel: m.is_new_member ? 'Jemaat baru' : m.status_keaktifan,
  }));

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : resetAndClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tugaskan Volunteer</DialogTitle>
          <DialogDescription>Pilih jenis pelayanan, lalu tugaskan jemaat secara manual atau pakai rekomendasi.</DialogDescription>
        </DialogHeader>

        <div>
          <Label>Jenis Volunteer *</Label>
          <select
            value={jenisId ?? ''}
            onChange={(e) => {
              setJenisId(Number(e.target.value));
              setSelectedJemaatId(null);
            }}
            className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {jenisOptions.length === 0 && <option value="">Tidak ada jenis volunteer aktif</option>}
            {jenisOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex rounded-card border border-slate-200 p-0.5">
          <button
            type="button"
            onClick={() => setTab('manual')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-[6px] py-1.5 text-sm font-medium',
              tab === 'manual' ? 'bg-modul-event text-white' : 'text-slate-500 hover:bg-slate-50',
            )}
          >
            <User className="h-3.5 w-3.5" /> Cari Manual
          </button>
          <button
            type="button"
            onClick={() => setTab('suggest')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-[6px] py-1.5 text-sm font-medium',
              tab === 'suggest' ? 'bg-modul-event text-white' : 'text-slate-500 hover:bg-slate-50',
            )}
          >
            <Sparkles className="h-3.5 w-3.5" /> Sarankan
          </button>
        </div>

        {tab === 'manual' && (
          <div>
            <Label>Jemaat *</Label>
            <div className="mt-1">
              <JemaatSearchSelect
                options={manualOptions}
                value={selectedJemaatId}
                onChange={setSelectedJemaatId}
                isLoading={membersQuery.isLoading}
                disabled={!jenisId}
                placeholder="Cari jemaat terdaftar jenis ini..."
                emptyText="Tidak ada jemaat terdaftar untuk jenis volunteer ini"
              />
            </div>
          </div>
        )}

        {tab === 'suggest' && (
          <div>
            <p className="mb-2 text-xs text-slate-500">
              Diurutkan dari skor tertinggi (frekuensi tugas, keaktifan, kesesuaian jenis). Jemaat baru dan yang
              punya konflik jadwal sudah dikecualikan.
            </p>
            {suggestQuery.isLoading && <p className="py-4 text-center text-sm text-slate-400">Memuat rekomendasi...</p>}
            {!suggestQuery.isLoading && (suggestQuery.data?.length ?? 0) === 0 && (
              <p className="py-4 text-center text-sm text-slate-500">Tidak ada kandidat yang tersedia saat ini.</p>
            )}
            {!suggestQuery.isLoading && (suggestQuery.data?.length ?? 0) > 0 && (
              <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                {suggestQuery.data!.map((c) => (
                  <li
                    key={c.jemaat_id}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm',
                      selectedJemaatId === c.jemaat_id ? 'border-modul-event bg-modul-event/5' : 'border-slate-200',
                    )}
                  >
                    <div>
                      <p className="font-medium text-slate-800">{c.nama}</p>
                      <p className="text-xs text-slate-500">
                        Skor {(c.composite_score * 100).toFixed(0)} Â· {c.jumlah_tugas_30_hari}x tugas / 30 hari
                      </p>
                    </div>
                    <Button size="sm" variant={selectedJemaatId === c.jemaat_id ? 'default' : 'outline'} onClick={() => setSelectedJemaatId(c.jemaat_id)}>
                      Pilih
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose} disabled={isSubmitting}>
            Batal
          </Button>
          <Button
            onClick={() => selectedJemaatId && submitAssign(selectedJemaatId)}
            disabled={isSubmitting || !selectedJemaatId || !jenisId}
          >
            {isSubmitting ? 'Menugaskan...' : 'Tugaskan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}