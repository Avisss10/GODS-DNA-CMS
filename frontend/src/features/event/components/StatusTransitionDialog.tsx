import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EVENT_STATUS_LABELS, getTransitionConsequence } from '../event.utils';
import type { EventStatus } from '@/types/event.types';

interface StatusTransitionDialogProps {
  open: boolean;
  fromStatus: EventStatus;
  toStatus: EventStatus | null;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

// Semua transisi status event "tidak bisa mundur" — dialog konfirmasi ini
// wajib muncul sebelum eksekusi PATCH .../status (instruksi prompt Tahap 6).
export default function StatusTransitionDialog({
  open,
  fromStatus,
  toStatus,
  isSubmitting,
  onOpenChange,
  onConfirm,
}: StatusTransitionDialogProps) {
  if (!toStatus) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Ubah status ke &ldquo;{EVENT_STATUS_LABELS[toStatus]}&rdquo;?
          </DialogTitle>
          <DialogDescription>{getTransitionConsequence(fromStatus, toStatus)}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-slate-500">
          Transisi status tidak dapat dibatalkan atau dikembalikan ke status sebelumnya.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Batal
          </Button>
          <Button onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Memproses...' : 'Ya, Lanjutkan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}