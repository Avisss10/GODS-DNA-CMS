import { Cake } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
          <p className="text-sm text-destructive">Gagal memuat data jemaat</p>
        ) : birthdays.length === 0 ? (
          <p className="text-sm text-slate-500">Tidak ada ulang tahun jemaat dalam 7 hari ke depan</p>
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