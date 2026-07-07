import { useState } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { runScoring } from '@/features/scoring/scoring.api';

export default function RunScoringButton() {
  const [open, setOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  async function handleConfirm() {
    setIsRunning(true);
    try {
      const result = await runScoring();
      toast.success(`Scoring selesai: ${result.processed} jemaat diproses, ${result.skipped} dilewati`);
      setOpen(false);
    } catch {
      toast.error('Gagal menjalankan scoring, silakan coba lagi');
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isRunning && setOpen(next)}>
      <Button type="button" variant="secondary" className="gap-2" onClick={() => setOpen(true)}>
        <Zap className="h-4 w-4" />
        Jalankan Scoring Sekarang
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Jalankan Scoring Sekarang?</DialogTitle>
          <DialogDescription>
            Seluruh data skor keaktifan jemaat akan diproses ulang. Proses ini bisa memakan waktu beberapa saat.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isRunning}>
            Batal
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={isRunning} className="gap-2">
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Menjalankan...
              </>
            ) : (
              'Ya, Jalankan'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}