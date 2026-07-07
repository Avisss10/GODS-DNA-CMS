import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DeactivateCgDialogProps {
  open: boolean;
  blockerMessage: string | null; // pesan 409 dari backend, sudah mengandung jumlah anggota
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export default function DeactivateCgDialog({
  open,
  blockerMessage,
  isSubmitting,
  onOpenChange,
  onConfirm,
}: DeactivateCgDialogProps) {
  const isBlocked = !!blockerMessage;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {isBlocked ? (
          <>
            <DialogHeader>
              <DialogTitle>Tidak Bisa Menonaktifkan Cell Group</DialogTitle>
              <DialogDescription>{blockerMessage}</DialogDescription>
            </DialogHeader>
            <p className="text-sm text-slate-600">
              Keluarkan semua anggota di tab Anggota sebelum menonaktifkan Cell Group ini.
            </p>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Tutup</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Nonaktifkan Cell Group?</DialogTitle>
              <DialogDescription>
                Cell Group akan disembunyikan dari daftar. Kamu masih bisa mengaktifkannya kembali lewat notifikasi
                setelah ini.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Batal
              </Button>
              <Button variant="destructive" onClick={onConfirm} disabled={isSubmitting}>
                {isSubmitting ? 'Menonaktifkan...' : 'Ya, Nonaktifkan'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}