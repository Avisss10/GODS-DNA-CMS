import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ReportJenis } from '@/types/report.types';
import JemaatReportForm from './JemaatReportForm';
import EventReportForm from './EventReportForm';
import CgReportForm from './CgReportForm';
import VolunteerReportForm from './VolunteerReportForm';
import AnalyticsReportForm from './AnalyticsReportForm';

const TITLE_BY_JENIS: Record<ReportJenis, string> = {
  jemaat: 'Laporan Jemaat',
  event: 'Laporan Event',
  cg: 'Laporan Cell Group',
  volunteer: 'Laporan Volunteer',
  analytics: 'Laporan Analytics',
};

interface ReportFormModalProps {
  jenis: ReportJenis | null;
  onOpenChange: (open: boolean) => void;
  onAsyncReady: (payload: { token: string; message: string }) => void;
}

export default function ReportFormModal({ jenis, onOpenChange, onAsyncReady }: ReportFormModalProps) {
  return (
    <Dialog open={jenis !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {jenis && (
          <>
            <DialogHeader>
              <DialogTitle>{TITLE_BY_JENIS[jenis]}</DialogTitle>
            </DialogHeader>
            {jenis === 'jemaat' && <JemaatReportForm onAsyncReady={onAsyncReady} />}
            {jenis === 'event' && <EventReportForm onAsyncReady={onAsyncReady} />}
            {jenis === 'cg' && <CgReportForm onAsyncReady={onAsyncReady} />}
            {jenis === 'volunteer' && <VolunteerReportForm onAsyncReady={onAsyncReady} />}
            {jenis === 'analytics' && <AnalyticsReportForm onAsyncReady={onAsyncReady} />}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}