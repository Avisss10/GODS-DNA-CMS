import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface UnregisterVolunteerDialogProps {
  open: boolean;
  namaJenis: string | null;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export default function UnregisterVolunteerDialog({
  open,
  namaJenis,
  isSubmitting,
  onOpenChange,
  onConfirm,
}: UnregisterVolunteerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keluarkan dari jenis volunteer ini?</DialogTitle>
          <DialogDescription>
            Jemaat akan dikeluarkan dari {namaJenis ? `"${namaJenis}"` : 'jenis volunteer ini'}.
            Tindakan ini bisa didaftarkan ulang kapan saja.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Batal
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Memproses...' : 'Ya, Keluarkan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}