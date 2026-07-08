import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { EventDetail } from '@/types/event.types';
import EventForm from './EventForm';

interface EventFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  event?: EventDetail;
  onSuccess: () => void;
}

export default function EventFormModal({ open, onOpenChange, mode, event, onSuccess }: EventFormModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Buat Event' : 'Edit Event'}</DialogTitle>
        </DialogHeader>
        <EventForm
          mode={mode}
          event={event}
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