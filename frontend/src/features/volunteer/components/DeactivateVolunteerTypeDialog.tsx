import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DeactivateVolunteerTypeDialogProps {
  open: boolean;
  namaJenis: string | null;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export default function DeactivateVolunteerTypeDialog({
  open,
  namaJenis,
  isSubmitting,
  onOpenChange,
  onConfirm,
}: DeactivateVolunteerTypeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nonaktifkan Jenis Volunteer?</DialogTitle>
          <DialogDescription>
            {namaJenis ? `"${namaJenis}"` : 'Jenis volunteer ini'} akan ditandai nonaktif dan tidak
            akan muncul di dropdown pendaftaran baru. Kamu bisa mengaktifkannya kembali kapan saja.
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
      </DialogContent>
    </Dialog>
  );
}