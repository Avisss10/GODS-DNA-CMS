import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  isSubmitting?: boolean;
  variant?: 'default' | 'destructive';
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Ya, Lanjutkan',
  isSubmitting = false,
  variant = 'destructive',
  onOpenChange,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Batal
          </Button>
          <Button variant={variant} onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Memproses...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}