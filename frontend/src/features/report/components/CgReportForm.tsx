import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listCellGroups } from '@/features/cellgroup/cellgroup.api';
import { listJemaat } from '@/features/jemaat/jemaat.api';
import JemaatSearchSelect from '@/features/cellgroup/components/JemaatSearchSelect';
import { generateCgReport, previewCgReport } from '../report.api';
import { useReportGenerator } from '../report.hooks';
import type { ReportFormat } from '@/types/report.types';
import FormatSelect from './FormatSelect';
import ReportGenerateStatus from './ReportGenerateStatus';
import ReportPreviewTable from './ReportPreviewTable';

const JEMAAT_FETCH_LIMIT = 500;

interface CgReportFormProps {
  onAsyncReady?: (payload: { token: string; message: string }) => void;
}

export default function CgReportForm({ onAsyncReady }: CgReportFormProps) {
  const [cgId, setCgId] = useState<number | null>(null);
  const [jemaatId, setJemaatId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [format, setFormat] = useState<ReportFormat>('xlsx');
  const { stage, asyncToken, asyncMessage, run } = useReportGenerator({ onAsyncReady });

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

  const isBusy = stage === 'processing';

  // Kalau jumlah opsi yang termuat persis pas limit, kemungkinan besar
  // masih ada CG/jemaat lain yang belum termuat di picker ini.
  const isCgPossiblyTruncated = !cgLoading && (cellGroups?.length ?? 0) === JEMAAT_FETCH_LIMIT;
  const isJemaatPossiblyTruncated = !jemaatLoading && (jemaatList?.length ?? 0) === JEMAAT_FETCH_LIMIT;

  const previewQuery = useQuery({
    queryKey: ['report-preview', 'cg', cgId, jemaatId, startDate, endDate],
    queryFn: () =>
      previewCgReport({
        cgId: cgId ?? undefined,
        jemaatId: jemaatId ?? undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
  });

  function buildFilterDescription(): string | undefined {
    const parts: string[] = [];
    if (cgId != null) {
      parts.push(`Cell Group: ${cgOptions.find((o) => o.id === cgId)?.label ?? cgId}`);
    }
    if (jemaatId != null) {
      parts.push(`Jemaat: ${jemaatOptions.find((o) => o.id === jemaatId)?.label ?? jemaatId}`);
    }
    if (startDate || endDate) {
      parts.push(`Rentang: ${startDate || '...'} s/d ${endDate || '...'}`);
    }
    return parts.length > 0 ? parts.join('; ') : undefined;
  }

  function handleGenerate() {
    run(() =>
      generateCgReport({
        cgId: cgId ?? undefined,
        jemaatId: jemaatId ?? undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        format,
        filterDescription: buildFilterDescription(),
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
        {isCgPossiblyTruncated && (
          <p className="rounded-card border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
            Menampilkan {JEMAAT_FETCH_LIMIT} cell group pertama — kemungkinan ada cell group lain yang belum termuat di pilihan ini.
          </p>
        )}
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
        {isJemaatPossiblyTruncated && (
          <p className="rounded-card border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
            Menampilkan {JEMAAT_FETCH_LIMIT} jemaat pertama — kemungkinan ada jemaat lain yang belum termuat di pilihan ini.
          </p>
        )}
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