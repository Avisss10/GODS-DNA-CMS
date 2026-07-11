import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CellGroupDetail } from '@/types/cellgroup.types';
import CellGroupForm from './CellGroupForm';

interface CellGroupFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  cg?: CellGroupDetail;
  currentLeaderName?: string | null;
  onSuccess: () => void;
}

export default function CellGroupFormModal({
  open,
  onOpenChange,
  mode,
  cg,
  currentLeaderName,
  onSuccess,
}: CellGroupFormModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Tambah Cell Group' : 'Edit Cell Group'}</DialogTitle>
        </DialogHeader>
        <CellGroupForm
          mode={mode}
          cg={cg}
          currentLeaderName={currentLeaderName}
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