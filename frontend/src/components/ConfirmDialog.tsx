import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

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

// "default" tetap ditampilkan sebagai warning amber — dialog ini selalu
// dipakai untuk konfirmasi sebelum aksi, jarang murni informatif.
const VARIANT_ICON_CLASSES: Record<'default' | 'destructive', string> = {
  default: 'bg-amber-100 text-amber-600',
  destructive: 'bg-red-100 text-red-600',
};

// transition-colors (bukan transition-smooth bawaan Button) supaya hover/klik
// tidak ikut animasikan shadow+transform sekaligus — terasa lag di popup ini.
const NO_LAG_BUTTON_CLASS = 'transition-colors duration-150 active:scale-100';

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
        <DialogHeader className="items-center text-center sm:text-center">
          <span
            className={cn(
              'mb-1 flex h-12 w-12 items-center justify-center rounded-full',
              VARIANT_ICON_CLASSES[variant],
            )}
          >
            <AlertTriangle className="h-6 w-6" />
          </span>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className={NO_LAG_BUTTON_CLASS}
          >
            Batal
          </Button>
          <Button variant={variant} onClick={onConfirm} disabled={isSubmitting} className={NO_LAG_BUTTON_CLASS}>
            {isSubmitting ? 'Memproses...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}