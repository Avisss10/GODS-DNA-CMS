import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { VolunteerTypeListItem } from '@/types/volunteer.types';
import VolunteerTypeForm from './VolunteerTypeForm';

interface VolunteerTypeFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  item?: VolunteerTypeListItem;
  onSuccess: () => void;
}

export default function VolunteerTypeFormModal({
  open,
  onOpenChange,
  mode,
  item,
  onSuccess,
}: VolunteerTypeFormModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Tambah Jenis Volunteer' : 'Edit Jenis Volunteer'}</DialogTitle>
        </DialogHeader>
        <VolunteerTypeForm
          mode={mode}
          item={item}
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