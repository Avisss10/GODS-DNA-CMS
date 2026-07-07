import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CgMeetingDetail } from '@/types/cellgroup.types';
import MeetingForm from './MeetingForm';

interface MeetingFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  cgId?: number;
  meeting?: CgMeetingDetail;
  onSuccess: () => void;
}

export default function MeetingFormModal({
  open,
  onOpenChange,
  mode,
  cgId,
  meeting,
  onSuccess,
}: MeetingFormModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Tambah Meeting' : 'Edit Meeting'}</DialogTitle>
        </DialogHeader>
        <MeetingForm
          mode={mode}
          cgId={cgId}
          meeting={meeting}
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