import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { generateJemaatReport } from '../report.api';
import { useReportGenerator } from '../report.hooks';
import type { ReportFormat } from '@/types/report.types';
import FormatSelect from './FormatSelect';
import ReportGenerateStatus from './ReportGenerateStatus';

// Laporan Jemaat SENGAJA hanya punya pilihan format — TIDAK ada filter lain
// dan TIDAK ada toggle "include sensitive" (sesuai kontrak BAGIAN 7).
export default function JemaatReportForm() {
  const [format, setFormat] = useState<ReportFormat>('xlsx');
  const { stage, asyncToken, asyncMessage, run } = useReportGenerator();

  const isBusy = stage === 'preparing' || stage === 'processing';

  function handleGenerate() {
    run(() => generateJemaatReport({ format }));
  }

  return (
    <div className="space-y-4">
      <FormatSelect value={format} onChange={setFormat} disabled={isBusy} />

      <Button type="button" onClick={handleGenerate} disabled={isBusy} className="w-full">
        {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
        Generate Laporan
      </Button>

      <ReportGenerateStatus stage={stage} asyncToken={asyncToken} asyncMessage={asyncMessage} />
    </div>
  );
}