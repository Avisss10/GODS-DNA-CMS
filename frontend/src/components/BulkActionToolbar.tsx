import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BulkActionToolbarProps {
  count: number;
  actionLabel: string;
  onAction: () => void;
  onClear: () => void;
  disabled?: boolean;
}

export default function BulkActionToolbar({ count, actionLabel, onAction, onClear, disabled }: BulkActionToolbarProps) {
  if (count === 0) return null;

  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-card border border-accent-from/30 bg-accent-from/5 px-4 py-2.5 print:hidden">
      <p className="text-sm font-medium text-slate-700">{count} dipilih</p>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={onClear} disabled={disabled}>
          Batal Pilih
        </Button>
        <Button variant="destructive" size="sm" onClick={onAction} disabled={disabled}>
          <Trash2 className="h-3.5 w-3.5" />
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}