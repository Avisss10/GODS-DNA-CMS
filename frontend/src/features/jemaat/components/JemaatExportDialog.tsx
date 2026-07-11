import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { generateJemaatReport, previewJemaatReport } from '@/features/report/report.api';
import { useReportGenerator } from '@/features/report/report.hooks';
import FormatSelect from '@/features/report/components/FormatSelect';
import ReportGenerateStatus from '@/features/report/components/ReportGenerateStatus';
import ReportPreviewTable from '@/features/report/components/ReportPreviewTable';
import JemaatReportFields from '@/features/report/components/JemaatReportFields';
import type { JemaatReportMode, ReportFormat } from '@/types/report.types';

interface JemaatExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ids: number[];
  defaultMode?: JemaatReportMode;
  /** Ringkasan filter list yang sedang aktif — ikut dicetak di file export. */
  filterDescription?: string;
}

export default function JemaatExportDialog({
  open,
  onOpenChange,
  ids,
  defaultMode = 'ringkas',
  filterDescription,
}: JemaatExportDialogProps) {
  const [format, setFormat] = useState<ReportFormat>('xlsx');
  const [mode, setMode] = useState<JemaatReportMode>(defaultMode);
  const { stage, asyncToken, asyncMessage, run, reset } = useReportGenerator();

  const isBusy = stage === 'processing';

  const previewQuery = useQuery({
    queryKey: ['report-preview', 'jemaat', mode, ids],
    queryFn: () => previewJemaatReport({ ids, mode }),
    enabled: open && ids.length > 0,
  });

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleGenerate() {
    run(() => generateJemaatReport({ format, mode, ids, filterDescription }));
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export Data Jemaat</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-slate-500">{ids.length} jemaat terpilih</p>
          {filterDescription && (
            <p className="rounded-card border border-slate-200 bg-slate-50 p-2 text-xs text-slate-500">
              Filter aktif yang akan dicatat di file: <span className="font-medium text-slate-700">{filterDescription}</span>
            </p>
          )}

          <JemaatReportFields mode={mode} onModeChange={setMode} disabled={isBusy} />

          <ReportPreviewTable
            columns={previewQuery.data?.columns ?? []}
            rows={previewQuery.data?.rows ?? []}
            total={previewQuery.data?.total ?? 0}
            isLoading={previewQuery.isLoading}
            isError={previewQuery.isError}
          />

          <FormatSelect value={format} onChange={setFormat} disabled={isBusy} />

          <Button type="button" onClick={handleGenerate} disabled={isBusy || ids.length === 0} className="w-full">
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            Export
          </Button>

          <ReportGenerateStatus stage={stage} asyncToken={asyncToken} asyncMessage={asyncMessage} onRetry={handleGenerate} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
