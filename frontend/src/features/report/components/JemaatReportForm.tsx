import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { generateJemaatReport, previewJemaatReport } from '../report.api';
import { useReportGenerator } from '../report.hooks';
import type { JemaatReportMode, ReportFormat } from '@/types/report.types';
import FormatSelect from './FormatSelect';
import ReportGenerateStatus from './ReportGenerateStatus';
import ReportPreviewTable from './ReportPreviewTable';
import JemaatReportFields from './JemaatReportFields';

interface JemaatReportFormProps {
  onAsyncReady?: (payload: { token: string; message: string }) => void;
}

// Laporan Jemaat dari Report Page ini SELALU mencakup semua jemaat aktif
// (tanpa `ids`) — untuk export sebagian jemaat terpilih, lihat
// JemaatExportDialog (dibuka dari bulk-action di JemaatListPage), yang
// memakai form field & preview yang sama (JemaatReportFields).
export default function JemaatReportForm({ onAsyncReady }: JemaatReportFormProps) {
  const [mode, setMode] = useState<JemaatReportMode>('ringkas');
  const [format, setFormat] = useState<ReportFormat>('xlsx');
  const { stage, asyncToken, asyncMessage, run } = useReportGenerator({ onAsyncReady });

  const isBusy = stage === 'processing';

  const previewQuery = useQuery({
    queryKey: ['report-preview', 'jemaat', mode],
    queryFn: () => previewJemaatReport({ mode }),
  });

  function handleGenerate() {
    run(() => generateJemaatReport({ format, mode }));
  }

  return (
    <div className="space-y-4">
      <JemaatReportFields mode={mode} onModeChange={setMode} disabled={isBusy} />

      <ReportPreviewTable
        columns={previewQuery.data?.columns ?? []}
        rows={previewQuery.data?.rows ?? []}
        total={previewQuery.data?.total ?? 0}
        isLoading={previewQuery.isLoading}
        isError={previewQuery.isError}
      />

      <FormatSelect value={format} onChange={setFormat} disabled={isBusy} />

      <Button type="button" onClick={handleGenerate} disabled={isBusy} className="w-full">
        {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
        Export
      </Button>

      <ReportGenerateStatus stage={stage} asyncToken={asyncToken} asyncMessage={asyncMessage} onRetry={handleGenerate} />
    </div>
  );
}
