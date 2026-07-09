import { CalendarDays } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import type { EventListItem } from '@/features/event/event.api';
import { formatEventDate, getEventStatusVariant, getUpcomingEvents } from './dashboard.utils';

interface UpcomingEventsWidgetProps {
  data: EventListItem[] | undefined;
  isLoading: boolean;
  isError: boolean;
}

export default function UpcomingEventsWidget({ data, isLoading, isError }: UpcomingEventsWidgetProps) {
  const upcoming = data ? getUpcomingEvents(data, 5) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4 text-modul-event" />
          Event Mendatang
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : isError ? (
          <ErrorState message="Gagal memuat data event" className="border-none bg-transparent py-4" />
        ) : upcoming.length === 0 ? (
          <EmptyState icon={CalendarDays} title="Tidak ada event mendatang" className="border-none py-4" />
        ) : (
          upcoming.map((event) => {
            const statusInfo = getEventStatusVariant(event.status);
            return (
              // TODO: arahkan ke halaman detail event setelah Tahap 6 (detail event) tersedia
              <div
                key={event.id}
                className="flex items-center justify-between gap-3 rounded-md border border-transparent p-2 transition-smooth hover:border-border"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{event.judul}</p>
                  <p className="text-xs text-slate-500">{formatEventDate(event.waktu_mulai)}</p>
                </div>
                <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}