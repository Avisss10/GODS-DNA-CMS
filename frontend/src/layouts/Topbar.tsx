import { useQuery } from '@tanstack/react-query';
import { Bell, LogOut, Menu, Search } from 'lucide-react';
import { useMatches, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { getUnreadCount, notificationKeys } from '@/features/notification/notification.api';
import { useAuthStore } from '@/store/auth.store';

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
  const nama = useAuthStore((s) => s.nama);
  const peran = useAuthStore((s) => s.peran);

  // Endpoint notifikasi LEADER-only di backend — jangan fetch kalau ADMIN (403).
  const unreadCountQuery = useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: getUnreadCount,
    enabled: peran === 'LEADER',
    refetchInterval: UNREAD_COUNT_POLL_MS,
  });

  const unreadCount = unreadCountQuery.data ?? 0;

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
        <div className="relative hidden sm:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Cari cepat..." className="w-48 pl-8 lg:w-64" />
        </div>

        {peran === 'LEADER' && (
          <button
            type="button"
            className="relative rounded-card p-2 transition-smooth hover:bg-black/5"
            aria-label="Notifikasi"
            onClick={() => navigate('/notification')}
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