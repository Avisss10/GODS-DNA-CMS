import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { generateAnalyticsReport } from '../report.api';
import { useReportGenerator } from '../report.hooks';
import type { ReportFormat } from '@/types/report.types';
import FormatSelect from './FormatSelect';
import ReportGenerateStatus from './ReportGenerateStatus';

const BULAN_OPTIONS = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' },
];

export default function AnalyticsReportForm() {
  const [bulan, setBulan] = useState(12);
  const [format, setFormat] = useState<ReportFormat>('xlsx');
  const { stage, asyncToken, asyncMessage, run } = useReportGenerator();

  const isBusy = stage === 'preparing' || stage === 'processing';

  function handleGenerate() {
    run(() => generateAnalyticsReport({ bulan, format }));
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Bulan</Label>
        <select
          value={bulan}
          disabled={isBusy}
          onChange={(e) => setBulan(Number(e.target.value))}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {BULAN_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <FormatSelect value={format} onChange={setFormat} disabled={isBusy} />

      <Button type="button" onClick={handleGenerate} disabled={isBusy} className="w-full">
        {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
        Generate Laporan
      </Button>

      <ReportGenerateStatus stage={stage} asyncToken={asyncToken} asyncMessage={asyncMessage} />
    </div>
  );
}