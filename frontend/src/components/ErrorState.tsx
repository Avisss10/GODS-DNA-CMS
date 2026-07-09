import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  /** Aksi kustom (mis. tombol navigasi) — dipakai kalau bukan sekadar refetch. Menggantikan tombol "Coba Lagi". */
  action?: React.ReactNode;
  className?: string;
}

/** Pola error-state seragam — ikon alert + pesan + tombol "Coba Lagi" opsional (refetch). */
export default function ErrorState({ message = 'Gagal memuat data. Silakan coba lagi.', onRetry, action, className }: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-card border border-destructive/30 bg-destructive/5 py-10 text-center',
        className,
      )}
    >
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <p className="text-sm text-destructive">{message}</p>
      {action ??
        (onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Coba Lagi
          </Button>
        ))}
    </div>
  );
}
