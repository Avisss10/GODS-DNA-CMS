import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { addMember, listCellGroups } from '@/features/cellgroup/cellgroup.api';

interface AddToCellGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jemaatId: number;
  onSuccess: () => void;
}

export default function AddToCellGroupDialog({ open, onOpenChange, jemaatId, onSuccess }: AddToCellGroupDialogProps) {
  const [cgId, setCgId] = useState<number | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: cellGroups, isLoading } = useQuery({
    queryKey: ['cell-groups', 'list-all'],
    queryFn: () => listCellGroups({ limit: 500 }),
    enabled: open,
  });

  const activeCellGroups = (cellGroups ?? []).filter((cg) => cg.is_active);

  // Reset pilihan di SETIAP jalur penutupan (Batal, tombol X, Esc, klik
  // backdrop) — bukan cuma tombol Batal — supaya dialog tidak membuka
  // ulang dengan CG yang masih ter-pilih dari sesi sebelumnya.
  function handleOpenChange(next: boolean) {
    if (!next) setCgId('');
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (!cgId) return;
    setIsSubmitting(true);
    try {
      await addMember(cgId, jemaatId);
      toast.success('Jemaat berhasil ditambahkan ke Cell Group');
      setCgId('');
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 409) {
        toast.error('Jemaat ini sudah jadi anggota aktif Cell Group tersebut');
      } else {
        toast.error('Gagal menambahkan ke Cell Group');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah ke Cell Group</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cg-select">Cell Group</Label>
            <select
              id="cg-select"
              value={cgId}
              disabled={isLoading || isSubmitting}
              onChange={(e) => setCgId(e.target.value ? Number(e.target.value) : '')}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">{isLoading ? 'Memuat...' : 'Pilih Cell Group...'}</option>
              {activeCellGroups.map((cg) => (
                <option key={cg.id} value={cg.id}>
                  {cg.nama}
                </option>
              ))}
            </select>
            {!isLoading && activeCellGroups.length === 0 && (
              <p className="text-xs text-slate-400">Belum ada Cell Group aktif.</p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
              Batal
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!cgId || isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Tambahkan
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
