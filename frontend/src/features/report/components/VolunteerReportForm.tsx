import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listEvents } from '@/features/event/event.api';
import { listJemaat } from '@/features/jemaat/jemaat.api';
import JemaatSearchSelect from '@/features/cellgroup/components/JemaatSearchSelect';
import { generateVolunteerReport, previewVolunteerReport } from '../report.api';
import { useReportGenerator } from '../report.hooks';
import type { ReportFormat } from '@/types/report.types';
import FormatSelect from './FormatSelect';
import ReportGenerateStatus from './ReportGenerateStatus';
import ReportPreviewTable from './ReportPreviewTable';

const JEMAAT_FETCH_LIMIT = 500;

interface VolunteerReportFormProps {
  onAsyncReady?: (payload: { token: string; message: string }) => void;
}

export default function VolunteerReportForm({ onAsyncReady }: VolunteerReportFormProps) {
  const [jemaatId, setJemaatId] = useState<number | null>(null);
  const [eventId, setEventId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [format, setFormat] = useState<ReportFormat>('xlsx');
  const { stage, asyncToken, asyncMessage, run } = useReportGenerator({ onAsyncReady });

  const { data: jemaatList, isLoading: jemaatLoading } = useQuery({
    queryKey: ['jemaat', 'list-all'],
    queryFn: () => listJemaat({ limit: JEMAAT_FETCH_LIMIT }),
  });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['event', 'list'],
    queryFn: () => listEvents(),
  });

  const jemaatOptions = useMemo(
    () => (jemaatList ?? []).map((j) => ({ id: j.id, label: j.nama })),
    [jemaatList],
  );

  const eventOptions = useMemo(
    () => (events ?? []).map((e) => ({ id: e.id, label: e.judul, sublabel: e.jenis })),
    [events],
  );

  const isBusy = stage === 'processing';

  // Kalau jumlah jemaat yang termuat persis pas limit, kemungkinan besar
  // masih ada jemaat lain yang belum termuat di picker ini.
  const isJemaatPossiblyTruncated = !jemaatLoading && (jemaatList?.length ?? 0) === JEMAAT_FETCH_LIMIT;

  const previewQuery = useQuery({
    queryKey: ['report-preview', 'volunteer', jemaatId, eventId, startDate, endDate],
    queryFn: () =>
      previewVolunteerReport({
        jemaatId: jemaatId ?? undefined,
        eventId: eventId ?? undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
  });

  function buildFilterDescription(): string | undefined {
    const parts: string[] = [];
    if (jemaatId != null) {
      parts.push(`Jemaat: ${jemaatOptions.find((o) => o.id === jemaatId)?.label ?? jemaatId}`);
    }
    if (eventId != null) {
      parts.push(`Event: ${eventOptions.find((o) => o.id === eventId)?.label ?? eventId}`);
    }
    if (startDate || endDate) {
      parts.push(`Rentang: ${startDate || '...'} s/d ${endDate || '...'}`);
    }
    return parts.length > 0 ? parts.join('; ') : undefined;
  }

  function handleGenerate() {
    run(() =>
      generateVolunteerReport({
        jemaatId: jemaatId ?? undefined,
        eventId: eventId ?? undefined,
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

      <div className="space-y-1.5">
        <Label>Event (opsional)</Label>
        <JemaatSearchSelect
          options={eventOptions}
          value={eventId}
          onChange={setEventId}
          isLoading={eventsLoading}
          disabled={isBusy}
          placeholder="Semua event"
          emptyText="Tidak ada event ditemukan"
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