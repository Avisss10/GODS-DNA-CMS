import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, LogOut, Menu } from 'lucide-react';
import { useMatches, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  getUnreadCount,
  listNotifications,
  markAsRead,
  notificationKeys,
  type NotificationItem,
} from '@/features/notification/notification.api';
import { getNotificationSeverity, type NotificationSeverity } from '@/features/notification/notification.constants';
import { useAuthStore } from '@/store/auth.store';

const SEVERITY_DOT_CLASSES: Record<NotificationSeverity, string> = {
  kritis: 'bg-red-600',
  peringatan: 'bg-amber-500',
  info: 'bg-slate-300',
};

interface TopbarProps {
  onOpenMobileMenu: () => void;
  onRequestLogout: () => void;
}

function getInitials(nama: string | null): string {
  if (!nama) return '?';
  return nama
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// Polling ringan tiap 30 detik. Query key sama dengan NotificationPage &
// dashboard widget, jadi invalidate di satu tempat ikut menyegarkan di sini.
const UNREAD_COUNT_POLL_MS = 30_000;

export default function Topbar({ onOpenMobileMenu, onRequestLogout }: TopbarProps) {
  const matches = useMatches();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const nama = useAuthStore((s) => s.nama);
  const peran = useAuthStore((s) => s.peran);
  const [notifOpen, setNotifOpen] = useState(false);

  // Endpoint notifikasi LEADER-only di backend — jangan fetch kalau ADMIN (403).
  const unreadCountQuery = useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: getUnreadCount,
    enabled: peran === 'LEADER',
    refetchInterval: UNREAD_COUNT_POLL_MS,
  });

  // Daftar cuma diambil saat dropdown ringkasan dibuka (lazy) — key sama
  // dengan tab "Belum Dibaca" di NotificationPage jadi cache-nya nyambung.
  const notifListQuery = useQuery({
    queryKey: notificationKeys.list(true),
    queryFn: () => listNotifications({ unread: true }),
    enabled: peran === 'LEADER' && notifOpen,
  });

  const unreadCount = unreadCountQuery.data ?? 0;
  const unreadNotifications = notifListQuery.data ?? [];

  async function handleNotifItemClick(item: NotificationItem) {
    if (item.is_read) return;
    try {
      await markAsRead(item.id);
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    } catch {
      toast.error('Gagal menandai notifikasi sebagai dibaca');
    }
  }

  const title =
    [...matches]
      .reverse()
      .map((match) => (match.handle as { title?: string } | undefined)?.title)
      .find(Boolean) ?? '';

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-300/60 bg-card/95 px-4 shadow-topbar backdrop-blur-sm sm:px-6 print:hidden">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="rounded-card p-2 transition-smooth hover:bg-black/5 sm:hidden"
          onClick={onOpenMobileMenu}
          aria-label="Buka menu"
        >
          <Menu className="h-5 w-5 text-slate-700" />
        </button>
        <h2 className="truncate text-base font-semibold text-slate-800 sm:text-lg">{title}</h2>
      </div>

      <div className="flex items-center gap-2">
        {peran === 'LEADER' && (
          <DropdownMenu open={notifOpen} onOpenChange={setNotifOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="relative rounded-card p-2 transition-smooth hover:bg-black/5"
                aria-label="Notifikasi"
              >
                <Bell className="h-5 w-5 text-slate-700" />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                    <span className="relative flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 max-w-[90vw] p-0">
              <div className="px-3 py-2 text-sm font-semibold text-slate-800">Notifikasi</div>
              <DropdownMenuSeparator className="my-0" />

              <div className="max-h-[360px] overflow-y-auto">
                {notifListQuery.isLoading && (
                  <div className="px-3 py-6 text-center text-sm text-slate-400">Memuat...</div>
                )}

                {!notifListQuery.isLoading && unreadNotifications.length === 0 && (
                  <div className="px-3 py-6 text-center text-sm text-slate-400">Tidak ada notifikasi belum dibaca</div>
                )}

                {unreadNotifications.map((item) => {
                  const severity = getNotificationSeverity(item.jenis);
                  return (
                    <DropdownMenuItem
                      key={item.id}
                      onClick={() => handleNotifItemClick(item)}
                      className="flex flex-col items-start gap-1 whitespace-normal rounded-none bg-accent-from/5 px-3 py-2"
                    >
                      <div className="flex w-full items-center gap-2">
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', SEVERITY_DOT_CLASSES[severity])} />
                        <p className="flex-1 truncate text-sm font-semibold text-slate-800">{item.judul}</p>
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-from" aria-label="Belum dibaca" />
                      </div>
                      <p className="line-clamp-2 text-xs text-slate-500">{item.pesan}</p>
                      <p className="text-[11px] text-slate-400">{new Date(item.created_at).toLocaleString('id-ID')}</p>
                    </DropdownMenuItem>
                  );
                })}
              </div>

              <DropdownMenuSeparator className="my-0" />
              <DropdownMenuItem
                onClick={() => navigate('/notification')}
                className="justify-center rounded-none py-2 text-sm font-medium text-accent-from"
              >
                Lihat semua notifikasi
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-accent-from to-accent-to text-sm font-semibold text-white"
              aria-label="Menu akun"
            >
              {getInitials(nama)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5">
              <p className="truncate text-sm font-medium text-slate-800">{nama}</p>
              {peran && (
                <Badge variant="secondary" className="mt-1 rounded-pill">
                  {peran}
                </Badge>
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onRequestLogout} className="text-red-600 focus:text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              Keluar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}