import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { listVolunteerTypes } from '@/features/volunteer/volunteer.api';
import { updateVolunteerNeeds } from '../event.api';
import type { VolunteerNeed } from '@/types/event.types';

interface RowState {
  jenisId: number;
  namaJenis: string;
  checked: boolean;
  kuota: number;
  isActive: boolean;
}

interface EditNeedsModalProps {
  open: boolean;
  eventId: number;
  currentNeeds: VolunteerNeed[];
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function EditNeedsModal({ open, eventId, currentNeeds, onOpenChange, onSuccess }: EditNeedsModalProps) {
  const [rows, setRows] = useState<RowState[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Jenis volunteer nonaktif tidak boleh muncul sbg opsi kebutuhan BARU
  // (instruksi Tahap 6) â€” tapi kalau event ini sudah punya kuota utk jenis
  // yg sekarang nonaktif, tetap ditampilkan (read-only info) supaya tidak
  // hilang begitu saja dari daftar.
  const typesQuery = useQuery({
    queryKey: ['volunteer-types', 'list'],
    queryFn: listVolunteerTypes,
    enabled: open,
  });

  useEffect(() => {
    if (!open || !typesQuery.data) return;
    const activeTypes = typesQuery.data.filter((t) => t.is_active);
    const needByJenisId = new Map(currentNeeds.map((n) => [n.volunteer_type_id, n]));

    const rowsFromActive: RowState[] = activeTypes.map((t) => {
      const existing = needByJenisId.get(t.id);
      return {
        jenisId: t.id,
        namaJenis: t.nama,
        checked: !!existing,
        kuota: existing?.kuota ?? 1,
        isActive: true,
      };
    });

    // Kebutuhan lama yang jenisnya sudah nonaktif â€” tampilkan tapi kunci
    // (tidak bisa dicentang ulang kalau sempat dilepas).
    const orphanRows: RowState[] = currentNeeds
      .filter((n) => !activeTypes.some((t) => t.id === n.volunteer_type_id))
      .map((n) => ({ jenisId: n.volunteer_type_id, namaJenis: n.nama_jenis, checked: true, kuota: n.kuota, isActive: false }));

    setRows([...rowsFromActive, ...orphanRows]);
    setErrorMessage(null);
  }, [open, typesQuery.data, currentNeeds]);

  function toggleRow(jenisId: number) {
    setRows((prev) => prev.map((r) => (r.jenisId === jenisId ? { ...r, checked: !r.checked } : r)));
  }

  function setKuota(jenisId: number, value: number) {
    setRows((prev) => prev.map((r) => (r.jenisId === jenisId ? { ...r, kuota: value } : r)));
  }

  async function handleSubmit() {
    setErrorMessage(null);
    const checkedRows = rows.filter((r) => r.checked);
    if (checkedRows.some((r) => !Number.isInteger(r.kuota) || r.kuota < 1)) {
      setErrorMessage('Kuota harus berupa angka bulat minimal 1 untuk setiap jenis yang dicentang.');
      return;
    }

    setIsSubmitting(true);
    try {
      const needs = checkedRows.map((r) => ({ jenis_id: r.jenisId, kuota: r.kuota }));
      await updateVolunteerNeeds(eventId, { needs });
      toast.success('Kebutuhan volunteer berhasil disimpan');
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      if (isAxiosError(err) && (err.response?.status === 409 || err.response?.status === 400)) {
        setErrorMessage(err.response.data?.message ?? 'Gagal menyimpan kebutuhan volunteer');
      } else {
        toast.error('Terjadi kesalahan pada server, silakan coba lagi');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Kebutuhan Volunteer</DialogTitle>
          <DialogDescription>
            Centang jenis volunteer yang dibutuhkan dan isi kuotanya. Melepas centang berarti kuota jenis
            tersebut akan dihapus (penugasan menjadi tanpa batas).
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        {typesQuery.isLoading && <p className="py-4 text-center text-sm text-slate-400">Memuat jenis volunteer...</p>}

        {!typesQuery.isLoading && rows.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-500">Belum ada jenis volunteer aktif.</p>
        )}

        {!typesQuery.isLoading && rows.length > 0 && (
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {rows.map((r) => (
              <li
                key={r.jenisId}
                className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={r.checked}
                  disabled={!r.isActive || isSubmitting}
                  onChange={() => toggleRow(r.jenisId)}
                  className="h-4 w-4"
                />
                <span className="flex-1 text-sm text-slate-700">
                  {r.namaJenis}
                  {!r.isActive && <span className="ml-1 text-xs text-slate-400">(nonaktif)</span>}
                </span>
                <input
                  type="number"
                  min={1}
                  value={r.kuota}
                  disabled={!r.checked || isSubmitting}
                  onChange={(e) => setKuota(r.jenisId, Number(e.target.value))}
                  className="h-8 w-20 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                />
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || typesQuery.isLoading}>
            {isSubmitting ? 'Menyimpan...' : 'Simpan Kebutuhan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}