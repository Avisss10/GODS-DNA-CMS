import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { downloadReport, extractErrorMessage } from '../report.api';
import type { ReportStage } from '../report.hooks';

interface ReportGenerateStatusProps {
  stage: ReportStage;
  asyncToken: string | null;
  asyncMessage: string;
}

export default function ReportGenerateStatus({ stage, asyncToken, asyncMessage }: ReportGenerateStatusProps) {
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  if (stage === 'idle') return null;

  async function handleDownload() {
    if (!asyncToken) return;
    setDownloading(true);
    setDownloadError('');
    try {
      await downloadReport(asyncToken);
      setDownloaded(true);
      toast.success('Laporan berhasil diunduh');
    } catch (err) {
      // 404: token tidak valid/sudah dipakai/kadaluarsa â€” tangani dengan
      // pesan jelas, jangan crash.
      const message = await extractErrorMessage(
        err,
        'Link unduhan sudah tidak berlaku (sudah dipakai atau kadaluarsa).',
      );
      setDownloadError(message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="rounded-card border border-slate-200 bg-slate-50 p-3 text-sm">
      {(stage === 'preparing' || stage === 'processing') && (
        <div className="flex items-center gap-2 text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          {stage === 'preparing' ? 'Menyiapkan...' : 'Diproses...'}
        </div>
      )}

      {stage === 'done-sync' && (
        <div className="flex items-center gap-2 font-medium text-status-aktifText">
          <CheckCircle2 className="h-4 w-4" />
          Diunduh
        </div>
      )}

      {stage === 'done-async' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 font-medium text-slate-700">
            <CheckCircle2 className="h-4 w-4 text-status-aktifText" />
            Siap diunduh
          </div>

          {!downloaded && (
            <div className="flex items-start gap-2 rounded-card border border-amber-300 bg-amber-50 p-2.5 text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="font-medium">
                Unduh sekarang â€” link ini akan kedaluwarsa dalam 15 menit dan hanya bisa diunduh sekali.
              </p>
            </div>
          )}

          {asyncMessage && !downloaded && <p className="text-xs text-slate-500">{asyncMessage}</p>}

          {!downloaded && (
            <Button type="button" size="sm" disabled={downloading} onClick={handleDownload}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download
            </Button>
          )}

          {downloaded && (
            <p className="flex items-center gap-2 font-medium text-status-aktifText">
              <CheckCircle2 className="h-4 w-4" />
              File sudah diunduh.
            </p>
          )}

          {downloadError && (
            <p className="rounded-card border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              {downloadError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}