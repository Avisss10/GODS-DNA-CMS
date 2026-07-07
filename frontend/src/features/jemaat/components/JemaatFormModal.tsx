import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { JemaatFull } from '@/types/jemaat.types';
import JemaatForm from './JemaatForm';

interface JemaatFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  jemaat?: JemaatFull;
  onSuccess: () => void;
}

export default function JemaatFormModal({ open, onOpenChange, mode, jemaat, onSuccess }: JemaatFormModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Tambah Jemaat' : 'Edit Data Jemaat'}</DialogTitle>
        </DialogHeader>
        <JemaatForm
          mode={mode}
          jemaat={jemaat}
          onSuccess={() => {
            onSuccess();
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}