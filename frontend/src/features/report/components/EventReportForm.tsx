import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listEvents } from '@/features/event/event.api';
import JemaatSearchSelect from '@/features/cellgroup/components/JemaatSearchSelect';
import { generateEventReport, previewEventReport } from '../report.api';
import { useReportGenerator } from '../report.hooks';
import type { ReportFormat } from '@/types/report.types';
import FormatSelect from './FormatSelect';
import ReportGenerateStatus from './ReportGenerateStatus';
import ReportPreviewTable from './ReportPreviewTable';

interface EventReportFormProps {
  onAsyncReady?: (payload: { token: string; message: string }) => void;
}

export default function EventReportForm({ onAsyncReady }: EventReportFormProps) {
  const [eventId, setEventId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [format, setFormat] = useState<ReportFormat>('xlsx');
  const { stage, asyncToken, asyncMessage, run } = useReportGenerator({ onAsyncReady });

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['event', 'list'],
    queryFn: () => listEvents(),
  });

  const eventOptions = useMemo(
    () => (events ?? []).map((e) => ({ id: e.id, label: e.judul, sublabel: e.jenis })),
    [events],
  );

  const isBusy = stage === 'processing';

  const previewQuery = useQuery({
    queryKey: ['report-preview', 'event', eventId, startDate, endDate],
    queryFn: () =>
      previewEventReport({
        eventId: eventId ?? undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
  });

  function buildFilterDescription(): string | undefined {
    const parts: string[] = [];
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
      generateEventReport({
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