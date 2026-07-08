import { useState } from 'react';
import { isAxiosError } from 'axios';

export interface BulkActionResult {
  id: number;
  success: boolean;
  message: string;
}

function defaultExtractErrorMessage(err: unknown): string {
  if (isAxiosError<{ message?: string }>(err) && err.response?.data?.message) {
    return err.response.data.message;
  }
  return 'Gagal memproses item ini';
}

export function useBulkAction() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  // Dieksekusi berurutan (bukan Promise.all) supaya progress bisa dilaporkan
  // bertahap dan tidak membanjiri backend dengan request paralel sekaligus.
  // Setiap item gagal (mis. 409 dependensi) ditangkap sendiri — tidak
  // menghentikan item berikutnya.
  async function run(
    ids: number[],
    action: (id: number) => Promise<{ message: string }>,
    extractErrorMessage: (err: unknown) => string = defaultExtractErrorMessage,
  ): Promise<BulkActionResult[]> {
    setIsRunning(true);
    setProgress({ done: 0, total: ids.length });
    const results: BulkActionResult[] = [];

    for (const id of ids) {
      try {
        const res = await action(id);
        results.push({ id, success: true, message: res.message });
      } catch (err) {
        results.push({ id, success: false, message: extractErrorMessage(err) });
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    setIsRunning(false);
    return results;
  }

  return { run, isRunning, progress };
}