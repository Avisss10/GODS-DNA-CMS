import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ManagedUser } from '../user.api';

interface ToggleStatusDialogProps {
  target: ManagedUser | null;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export default function ToggleStatusDialog({ target, isSubmitting, onOpenChange, onConfirm }: ToggleStatusDialogProps) {
  const willDeactivate = target?.aktif ?? false;
  const username = target?.username ?? '';

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {willDeactivate ? `Nonaktifkan akun "${username}"?` : `Aktifkan akun "${username}"?`}
          </DialogTitle>
          <DialogDescription>
            {willDeactivate
              ? 'Akun ini tidak akan bisa login sampai diaktifkan kembali oleh Leader.'
              : 'Akun ini akan bisa login kembali seperti biasa.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Batal
          </Button>
          <Button variant={willDeactivate ? 'destructive' : 'default'} onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Memproses...' : willDeactivate ? 'Ya, Nonaktifkan' : 'Ya, Aktifkan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}