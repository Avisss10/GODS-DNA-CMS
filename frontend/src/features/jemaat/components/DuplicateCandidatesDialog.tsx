import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { JemaatDuplicateCandidates } from '@/types/jemaat.types';

interface DuplicateCandidatesDialogProps {
  open: boolean;
  duplicates: JemaatDuplicateCandidates;
  inputNama: string;
  inputTglLahir: string;
  isSaving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DuplicateCandidatesDialog({
  open,
  duplicates,
  inputNama,
  inputTglLahir,
  isSaving,
  onCancel,
  onConfirm,
}: DuplicateCandidatesDialogProps) {
  const hasByName = duplicates.byNameAndBirthdate.length > 0;
  const hasByPhone = duplicates.byPhone.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kemungkinan Data Duplikat</DialogTitle>
          <DialogDescription>
            Ditemukan data jemaat lain yang mirip. Periksa kembali sebelum melanjutkan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="rounded-card border border-input p-3">
            <p className="mb-1 font-semibold text-slate-700">Data yang sedang Anda input</p>
            <p className="text-slate-600">
              {inputNama} — {inputTglLahir}
            </p>
          </div>

          {hasByName && (
            <div>
              <p className="mb-1 font-semibold text-slate-700">Nama &amp; tanggal lahir mirip</p>
              <ul className="space-y-1">
                {duplicates.byNameAndBirthdate.map((d) => (
                  <li key={d.id} className="rounded-card bg-slate-100 px-3 py-2 text-slate-700">
                    {d.nama}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasByPhone && (
            <div>
              <p className="mb-1 font-semibold text-slate-700">Nomor HP sama</p>
              <ul className="space-y-1">
                {duplicates.byPhone.map((d) => (
                  <li key={d.id} className="rounded-card bg-slate-100 px-3 py-2 text-slate-700">
                    {d.nama}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            Batalkan
          </Button>
          <Button onClick={onConfirm} disabled={isSaving}>
            {isSaving ? 'Menyimpan...' : 'Tetap Simpan sebagai Data Baru'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}