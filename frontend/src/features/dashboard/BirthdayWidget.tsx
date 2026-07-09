import { Cake } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import type { JemaatListItem } from '@/features/jemaat/jemaat.api';
import { formatBirthdayDate, getUpcomingBirthdays } from './dashboard.utils';

interface BirthdayWidgetProps {
  data: JemaatListItem[] | undefined;
  isLoading: boolean;
  isError: boolean;
}

export default function BirthdayWidget({ data, isLoading, isError }: BirthdayWidgetProps) {
  const birthdays = data ? getUpcomingBirthdays(data, 7) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cake className="h-4 w-4 text-modul-jemaat" />
          Ulang Tahun Jemaat (7 Hari ke Depan)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : isError ? (
          <ErrorState message="Gagal memuat data jemaat" className="border-none bg-transparent py-4" />
        ) : birthdays.length === 0 ? (
          <EmptyState icon={Cake} title="Tidak ada ulang tahun jemaat dalam 7 hari ke depan" className="border-none py-4" />
        ) : (
          birthdays.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3 rounded-md p-2">
              <p className="truncate text-sm font-medium text-slate-800">{b.nama}</p>
              <span className="shrink-0 text-xs text-slate-500">
                {b.daysUntil === 0 ? 'Hari ini' : formatBirthdayDate(b.tglLahir)}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}