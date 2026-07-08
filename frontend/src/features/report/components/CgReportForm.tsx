import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listCellGroups } from '@/features/cellgroup/cellgroup.api';
import { listJemaat } from '@/features/jemaat/jemaat.api';
import JemaatSearchSelect from '@/features/cellgroup/components/JemaatSearchSelect';
import { generateCgReport } from '../report.api';
import { useReportGenerator } from '../report.hooks';
import type { ReportFormat } from '@/types/report.types';
import FormatSelect from './FormatSelect';
import ReportGenerateStatus from './ReportGenerateStatus';

const JEMAAT_FETCH_LIMIT = 500;

export default function CgReportForm() {
  const [cgId, setCgId] = useState<number | null>(null);
  const [jemaatId, setJemaatId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [format, setFormat] = useState<ReportFormat>('xlsx');
  const { stage, asyncToken, asyncMessage, run } = useReportGenerator();

  const { data: cellGroups, isLoading: cgLoading } = useQuery({
    queryKey: ['cellgroup', 'list-all'],
    queryFn: () => listCellGroups({ limit: JEMAAT_FETCH_LIMIT }),
  });

  const { data: jemaatList, isLoading: jemaatLoading } = useQuery({
    queryKey: ['jemaat', 'list-all'],
    queryFn: () => listJemaat({ limit: JEMAAT_FETCH_LIMIT }),
  });

  const cgOptions = useMemo(
    () => (cellGroups ?? []).map((cg) => ({ id: cg.id, label: cg.nama, sublabel: cg.nama_leader ?? undefined })),
    [cellGroups],
  );

  const jemaatOptions = useMemo(
    () => (jemaatList ?? []).map((j) => ({ id: j.id, label: j.nama })),
    [jemaatList],
  );

  const isBusy = stage === 'preparing' || stage === 'processing';

  function handleGenerate() {
    run(() =>
      generateCgReport({
        cgId: cgId ?? undefined,
        jemaatId: jemaatId ?? undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        format,
      }),
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Cell Group (opsional)</Label>
        <JemaatSearchSelect
          options={cgOptions}
          value={cgId}
          onChange={setCgId}
          isLoading={cgLoading}
          disabled={isBusy}
          placeholder="Semua cell group"
          emptyText="Tidak ada cell group ditemukan"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Jemaat (opsional)</Label>
        <JemaatSearchSelect
          options={jemaatOptions}
          value={jemaatId}
          onChange={setJemaatId}
          isLoading={jemaatLoading}
          disabled={isBusy}
          placeholder="Semua jemaat"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Dari tanggal</Label>
          <Input type="date" value={startDate} disabled={isBusy} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Sampai tanggal</Label>
          <Input type="date" value={endDate} disabled={isBusy} onChange={(e) => setEndDate(e.target.value)} />
        </div>
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