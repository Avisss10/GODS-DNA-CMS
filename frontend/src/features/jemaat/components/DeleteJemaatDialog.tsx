import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { JemaatDependencies } from '@/types/jemaat.types';

interface DeleteJemaatDialogProps {
  open: boolean;
  dependencies: JemaatDependencies | null;
  isDeleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export default function DeleteJemaatDialog({
  open,
  dependencies,
  isDeleting,
  onOpenChange,
  onConfirm,
}: DeleteJemaatDialogProps) {
  const hasDeps = !!dependencies;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {hasDeps ? (
          <>
            <DialogHeader>
              <DialogTitle>Tidak Bisa Menghapus Jemaat</DialogTitle>
              <DialogDescription>
                Selesaikan dependensi berikut dari modul terkait sebelum menghapus data ini.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-sm">
              {dependencies!.isLeaderOfActiveCg.length > 0 && (
                <div>
                  <p className="mb-1 font-semibold text-slate-700">Masih menjadi leader Cell Group aktif:</p>
                  <ul className="list-inside list-disc text-slate-600">
                    {dependencies!.isLeaderOfActiveCg.map((d) => (
                      <li key={d.id}>{d.nama}</li>
                    ))}
                  </ul>
                </div>
              )}
              {dependencies!.scheduledAsVolunteer.length > 0 && (
                <div>
                  <p className="mb-1 font-semibold text-slate-700">Masih terjadwal sebagai volunteer:</p>
                  <ul className="list-inside list-disc text-slate-600">
                    {dependencies!.scheduledAsVolunteer.map((d) => (
                      <li key={d.id}>{d.judul}</li>
                    ))}
                  </ul>
                </div>
              )}
              {dependencies!.activeMemberOfCg.length > 0 && (
                <div>
                  <p className="mb-1 font-semibold text-slate-700">Masih anggota aktif Cell Group:</p>
                  <ul className="list-inside list-disc text-slate-600">
                    {dependencies!.activeMemberOfCg.map((d) => (
                      <li key={d.id}>{d.nama}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Tutup</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Hapus Jemaat?</DialogTitle>
              <DialogDescription>
                Tindakan ini akan menonaktifkan data jemaat (soft delete). Lanjutkan?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
                Tidak
              </Button>
              <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
                {isDeleting ? 'Menghapus...' : 'Ya, Hapus'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}