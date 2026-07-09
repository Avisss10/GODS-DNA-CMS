import type { LucideIcon } from 'lucide-react';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  chipClass: string;
  iconClass: string;
  /** Kelas warna aksen border kiri, mis. 'border-l-modul-jemaat'. */
  accentClass: string;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}

export default function StatCard({
  label,
  value,
  icon: Icon,
  chipClass,
  iconClass,
  accentClass,
  isLoading,
  isError,
  errorMessage = 'Gagal memuat data',
}: StatCardProps) {
  return (
    <Card
      hoverLift
      className={cn(
        'border-y border-r border-l-4 border-y-slate-200/70 border-r-slate-200/70',
        accentClass,
      )}
    >
      <CardContent className="flex items-center gap-4 p-5">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-card', chipClass)}>
          <Icon className={cn('h-5 w-5', iconClass)} />
        </span>
        <div className="min-w-0 flex-1">
          {isLoading ? (
            <>
              <Skeleton className="mb-1.5 h-7 w-16" />
              <Skeleton className="h-3.5 w-24" />
            </>
          ) : isError ? (
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {errorMessage}
            </p>
          ) : (
            <>
              <p className="text-2xl font-bold text-slate-800">{value}</p>
              <p className="truncate text-xs text-slate-500">{label}</p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}