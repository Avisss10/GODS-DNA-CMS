import { useState } from 'react';
import { toast } from '@/lib/toast';
import { extractErrorMessage } from './report.api';
import type { ReportGenerateResult } from '@/types/report.types';

export type ReportStage = 'idle' | 'preparing' | 'processing' | 'done-sync' | 'done-async';

// Token & pesan async HANYA disimpan di state komponen (lewat hook ini),
// TIDAK di localStorage/store manapun â€” hilang begitu halaman di-reload
// atau form ditutup, sesuai instruksi prompt (5.C).
export function useReportGenerator() {
  const [stage, setStage] = useState<ReportStage>('idle');
  const [asyncToken, setAsyncToken] = useState<string | null>(null);
  const [asyncMessage, setAsyncMessage] = useState('');

  async function run(generateFn: () => Promise<ReportGenerateResult>) {
    setStage('preparing');
    setAsyncToken(null);
    setAsyncMessage('');

    // Jeda sebentar supaya status "Menyiapkan..." sempat terlihat sebelum
    // beralih ke "Diproses..." â€” request sesungguhnya baru jalan sesudahnya.
    await new Promise((resolve) => setTimeout(resolve, 300));
    setStage('processing');

    try {
      const result = await generateFn();
      if (result.async) {
        setAsyncToken(result.token);
        setAsyncMessage(result.message);
        setStage('done-async');
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