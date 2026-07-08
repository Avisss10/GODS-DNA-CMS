import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { EventVolunteer } from '@/types/event.types';

interface CancelVolunteerDialogProps {
  open: boolean;
  assignment: EventVolunteer | null;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export default function CancelVolunteerDialog({
  open,
  assignment,
  isSubmitting,
  onOpenChange,
  onConfirm,
}: CancelVolunteerDialogProps) {
  if (!assignment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Batalkan Penugasan?</DialogTitle>
          <DialogDescription>
            Penugasan <span className="font-medium">{assignment.nama_jemaat}</span> untuk{' '}
            <span className="font-medium">{assignment.nama_jenis}</span> akan dibatalkan dan hilang dari daftar
            penugasan aktif. Tindakan ini tidak dapat dibatalkan.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Batal
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Membatalkan...' : 'Ya, Batalkan Penugasan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}