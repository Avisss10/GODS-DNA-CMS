import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { AlertCircle, AlertTriangle, Bell, CheckCheck, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import { cn } from '@/lib/utils';
import {
  getUnreadCount,
  listNotifications,
  markAllAsRead,
  markAsRead,
  notificationKeys,
  type NotificationItem,
} from './notification.api';
import { getNotificationSeverity, SEVERITY_LABELS, type NotificationSeverity } from './notification.constants';

type FilterMode = 'unread' | 'all';

const SEVERITY_ICON: Record<NotificationSeverity, typeof AlertTriangle> = {
  kritis: AlertTriangle,
  peringatan: AlertCircle,
  info: Info,
};

// Kritis harus jelas beda dari yang biasa: border kiri tebal merah + bg
// merah muda. Peringatan pakai amber. Info netral (border tipis abu).
// PENTING: border-y-*/border-r-* dipakai (bukan border-* polos) supaya
// tailwind-merge (cn()) tidak menganggapnya konflik dengan border-l-{warna}
// dan diam-diam membuang aksen kiri tebal ini.
const SEVERITY_CARD_CLASSES: Record<NotificationSeverity, string> = {
  kritis: 'border-l-4 border-l-red-600 bg-red-50 border-y border-r border-y-red-200 border-r-red-200',
  peringatan: 'border-l-4 border-l-amber-500 bg-amber-50 border-y border-r border-y-amber-200 border-r-amber-200',
  info: 'border-l-4 border-l-slate-300 bg-card border-y border-r border-y-slate-200 border-r-slate-200',
};

const SEVERITY_ICON_CLASSES: Record<NotificationSeverity, string> = {
  kritis: 'text-red-600',
  peringatan: 'text-amber-600',
  info: 'text-slate-500',
};

export default function NotificationPage() {
  const queryClient = useQueryClient();
  const [filterMode, setFilterMode] = useState<FilterMode>('unread');
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  // Item yang baru diklik: tetap dirender dulu tapi memudar (opacity)
  // sebelum hilang dari daftar via refetch â€” supaya tidak "loncat" tiba-tiba.
  const [pendingReadIds, setPendingReadIds] = useState<Set<number>>(new Set());

  const isUnreadFilter = filterMode === 'unread';

  const { data, isLoading, isError } = useQuery({
    queryKey: notificationKeys.list(isUnreadFilter),
    queryFn: () => listNotifications({ unread: isUnreadFilter }),
  });

  const countQuery = useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: getUnreadCount,
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  }

  async function handleItemClick(item: NotificationItem) {
    if (item.is_read || pendingReadIds.has(item.id)) return;
    setPendingReadIds((prev) => new Set(prev).add(item.id));
    try {
      await markAsRead(item.id);
      window.setTimeout(() => {
        invalidateAll();
        setPendingReadIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }, 300);
    } catch {
      toast.error('Gagal menandai notifikasi sebagai dibaca');
      setPendingReadIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function handleMarkAllRead() {
    setIsMarkingAll(true);
    try {
      const res = await markAllAsRead();
      toast.success(res.message);
      invalidateAll();
    } catch {
      toast.error('Gagal menandai semua notifikasi');
    } finally {
      setIsMarkingAll(false);
    }
  }

  const items = data ?? [];
  const unreadCount = countQuery.data ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
            <Bell className="h-5 w-5 text-slate-600" />
            Notifikasi
            {unreadCount > 0 && (
              <Badge variant="destructive" className="rounded-pill">
                {unreadCount} belum dibaca
              </Badge>
            )}
          </h1>
          <p className="text-sm text-slate-500">Notifikasi sistem khusus Leader</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleMarkAllRead} disabled={isMarkingAll || unreadCount === 0}>
          <CheckCheck className="h-4 w-4" />
          {isMarkingAll ? 'Memproses...' : 'Tandai Semua Dibaca'}
        </Button>
      </div>

      <div className="flex gap-2">
        <Button variant={isUnreadFilter ? 'default' : 'outline'} size="sm" onClick={() => setFilterMode('unread')}>
          Belum Dibaca
        </Button>
        <Button variant={!isUnreadFilter ? 'default' : 'outline'} size="sm" onClick={() => setFilterMode('all')}>
          Semua
        </Button>
      </div>

      {isError && <ErrorState message="Gagal memuat notifikasi. Silakan muat ulang halaman." />}

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-card" />
          ))}
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <EmptyState
          icon={Bell}
          title={isUnreadFilter ? 'Tidak ada notifikasi belum dibaca' : 'Belum ada notifikasi'}
        />
      )}

      <div className="space-y-2">
        {items.map((item) => {
          const severity = getNotificationSeverity(item.jenis);
          const SeverityIcon = SEVERITY_ICON[severity];
          const isPending = pendingReadIds.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleItemClick(item)}
              className={cn(
                'flex w-full items-start gap-3 rounded-card p-4 text-left shadow-card transition-smooth',
                SEVERITY_CARD_CLASSES[severity],
                isPending && 'opacity-40',
                item.is_read && 'opacity-70',
              )}
            >
              <SeverityIcon
                className={cn(
                  severity === 'kritis' ? 'h-6 w-6' : 'h-5 w-5',
                  'mt-0.5 shrink-0',
                  SEVERITY_ICON_CLASSES[severity],
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-800">{item.judul}</p>
                  {severity !== 'info' && (
                    <Badge
                      variant={severity === 'kritis' ? 'destructive' : 'secondary'}
                      className={cn(severity === 'peringatan' && 'bg-amber-100 text-amber-800')}
                    >
                      {SEVERITY_LABELS[severity]}
                    </Badge>
                  )}
                  {!item.is_read && !isPending && (
                    <span className="h-2 w-2 rounded-full bg-accent-from" aria-label="Belum dibaca" />
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-600">{item.pesan}</p>
                <p className="mt-1 text-xs text-slate-400">{new Date(item.created_at).toLocaleString('id-ID')}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}