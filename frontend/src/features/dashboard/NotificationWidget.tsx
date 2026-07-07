import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getUnreadCount, listNotifications } from '@/features/notification/notification.api';
import { formatRelativeTime } from './dashboard.utils';

export default function NotificationWidget() {
  const navigate = useNavigate();

  const countQuery = useQuery({
    queryKey: ['dashboard', 'notification-unread-count'],
    queryFn: getUnreadCount,
  });

  const listQuery = useQuery({
    queryKey: ['dashboard', 'notification-list'],
    queryFn: () => listNotifications({ unread: true }),
  });

  const isLoading = countQuery.isLoading || listQuery.isLoading;
  const isError = countQuery.isError || listQuery.isError;
  const items = (listQuery.data ?? []).slice(0, 5);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4 text-slate-600" />
          Notifikasi
          {!isLoading && !isError && !!countQuery.data && (
            <Badge variant="destructive" className="ml-1">
              {countQuery.data}
            </Badge>
          )}
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
          <p className="text-sm text-destructive">Gagal memuat notifikasi</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">Tidak ada notifikasi belum dibaca</p>
        ) : (
          items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => navigate('/notification')}
              className="block w-full rounded-md border border-transparent p-2 text-left transition-colors hover:border-border hover:bg-accent/50"
            >
              <p className="truncate text-sm font-medium text-slate-800">{n.judul}</p>
              <p className="text-xs text-slate-500">{formatRelativeTime(n.created_at)}</p>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}