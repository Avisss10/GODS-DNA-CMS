import { useState } from 'react';
import { toast } from '@/lib/toast';
import { extractErrorMessage } from './report.api';
import type { ReportGenerateResult } from '@/types/report.types';

export type ReportStage = 'idle' | 'processing' | 'done-sync' | 'done-async';

interface UseReportGeneratorOptions {
  // Dipanggil begitu hasil async (token+message) diterima — dipakai
  // caller untuk mengangkat token ke state yang lebih persisten (mis.
  // ReportPage) supaya tidak hilang kalau dialog form ditutup sebelum
  // sempat diunduh. Token & pesan tetap juga disimpan di state hook
  // ini untuk tampilan status di dalam form yang sedang terbuka.
  onAsyncReady?: (payload: { token: string; message: string }) => void;
}

// Token & pesan async disimpan di state komponen (lewat hook ini) untuk
// tampilan status di dalam form — TIDAK di localStorage/store manapun,
// sesuai instruksi prompt (5.C). Caller yang butuh token tetap hidup
// setelah form ditutup harus pakai `onAsyncReady` untuk menyalinnya ke
// state yang lebih tinggi (lihat AsyncDownloadBanner + ReportPage).
export function useReportGenerator({ onAsyncReady }: UseReportGeneratorOptions = {}) {
  const [stage, setStage] = useState<ReportStage>('idle');
  const [asyncToken, setAsyncToken] = useState<string | null>(null);
  const [asyncMessage, setAsyncMessage] = useState('');

  async function run(generateFn: () => Promise<ReportGenerateResult>) {
    setAsyncToken(null);
    setAsyncMessage('');
    setStage('processing');

    try {
      const result = await generateFn();
      if (result.async) {
        setAsyncToken(result.token);
        setAsyncMessage(result.message);
        setStage('done-async');
        onAsyncReady?.({ token: result.token, message: result.message });
      } else {
        setStage('done-sync');
        toast.success('Laporan berhasil diunduh');
      }
    } catch (err) {
      setStage('idle');
      const message = await extractErrorMessage(err, 'Gagal membuat laporan. Silakan coba lagi.');
      toast.error(message);
    }
  }

  function reset() {
    setStage('idle');
    setAsyncToken(null);
    setAsyncMessage('');
  }

  return { stage, asyncToken, asyncMessage, run, reset };
}