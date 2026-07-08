import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { BulkActionResult } from '@/hooks/useBulkAction';

interface BulkActionSummaryDialogProps {
  open: boolean;
  results: BulkActionResult[] | null;
  itemLabel: (id: number) => string;
  onOpenChange: (open: boolean) => void;
}

export default function BulkActionSummaryDialog({ open, results, itemLabel, onOpenChange }: BulkActionSummaryDialogProps) {
  const items = results ?? [];
  const success = items.filter((r) => r.success);
  const failed = items.filter((r) => !r.success);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Hasil Aksi Massal</DialogTitle>
          <DialogDescription>
            {success.length} berhasil, {failed.length} gagal dari {items.length} item.
          </DialogDescription>
        </DialogHeader>

        {failed.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">Detail yang gagal:</p>
            <ul className="space-y-1.5 text-sm">
              {failed.map((r) => (
                <li key={r.id} className="rounded-md border border-red-200 bg-red-50 p-2">
                  <span className="font-medium text-slate-800">{itemLabel(r.id)}</span>
                  <p className="text-xs text-red-700">{r.message}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}