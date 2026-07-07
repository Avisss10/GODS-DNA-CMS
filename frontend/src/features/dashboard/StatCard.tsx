import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  chipClass: string;
  iconClass: string;
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
  isLoading,
  isError,
  errorMessage = 'Gagal memuat data',
}: StatCardProps) {
  return (
    <Card>
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
            <p className="text-sm text-destructive">{errorMessage}</p>
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