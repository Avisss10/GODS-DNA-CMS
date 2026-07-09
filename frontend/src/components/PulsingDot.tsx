import { cn } from '@/lib/utils';

interface PulsingDotProps {
  className?: string;
  colorClass?: string;
}

// Dot berdenyut halus dipakai di badge "Aktif" di seluruh modul (Jemaat,
// Cell Group, Volunteer, User Management) — satu sumber kebenaran supaya
// konsisten, bukan diduplikasi per halaman.
export default function PulsingDot({ className, colorClass = 'bg-status-aktif' }: PulsingDotProps) {
  return (
    <span className={cn('relative flex h-1.5 w-1.5', className)}>
      <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', colorClass)} />
      <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', colorClass)} />
    </span>
  );
}
