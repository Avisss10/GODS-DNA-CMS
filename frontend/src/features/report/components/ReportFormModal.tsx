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
}

export default function ReportFormModal({ jenis, onOpenChange }: ReportFormModalProps) {
  return (
    <Dialog open={jenis !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        {jenis && (
          <>
            <DialogHeader>
              <DialogTitle>{TITLE_BY_JENIS[jenis]}</DialogTitle>
            </DialogHeader>
            {jenis === 'jemaat' && <JemaatReportForm />}
            {jenis === 'event' && <EventReportForm />}
            {jenis === 'cg' && <CgReportForm />}
            {jenis === 'volunteer' && <VolunteerReportForm />}
            {jenis === 'analytics' && <AnalyticsReportForm />}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}