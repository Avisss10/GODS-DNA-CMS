import { useState } from 'react';
import { AlertTriangle, Download, Loader2, X } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { downloadReport, extractErrorMessage } from '../report.api';
import type { ReportJenis } from '@/types/report.types';

const TITLE_BY_JENIS: Record<ReportJenis, string> = {
  jemaat: 'Laporan Jemaat',
  event: 'Laporan Event',
  cg: 'Laporan Cell Group',
  volunteer: 'Laporan Volunteer',
  analytics: 'Laporan Analytics',
};

export interface PendingDownload {
  token: string;
  message: string;
  jenis: ReportJenis;
}

interface AsyncDownloadBannerProps {
  pending: PendingDownload | null;
  onClear: () => void;
}

// Untuk laporan besar (>=500 baris), generate berjalan async dan token
// unduhannya hanya hidup 15 menit / sekali pakai. Banner ini dipasang di
// level ReportPage (bukan di dalam ReportFormModal) supaya token tidak
// hilang kalau user menutup dialog form sebelum sempat klik Download.
export default function AsyncDownloadBanner({ pending, onClear }: AsyncDownloadBannerProps) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  if (!pending) return null;

  async function handleDownload() {
    setDownloading(true);
    setError('');
    try {
      await downloadReport(pending!.token);
      toast.success('Laporan berhasil diunduh');
      onClear();
    } catch (err) {
      const message = await extractErrorMessage(
        err,
        'Link unduhan sudah tidak berlaku (sudah dipakai atau kadaluarsa).',
      );
      setError(message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex items-start gap-3 rounded-card border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1 space-y-1.5">
        <p className="font-medium">
          {TITLE_BY_JENIS[pending.jenis]} siap diunduh — link ini akan kedaluwarsa dalam 15 menit dan hanya bisa diunduh sekali.
        </p>
        {pending.message && <p className="text-xs text-amber-700">{pending.message}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button type="button" size="sm" disabled={downloading} onClick={handleDownload}>
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download
        </Button>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="text-amber-600 transition-smooth hover:text-amber-800"
        aria-label="Tutup notifikasi"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
