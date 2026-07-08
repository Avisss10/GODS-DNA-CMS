import { Bell, LogOut, Menu, Search } from 'lucide-react';
import { useMatches } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
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

export default function Topbar({ onOpenMobileMenu, onRequestLogout }: TopbarProps) {
  const matches = useMatches();
  const nama = useAuthStore((s) => s.nama);
  const peran = useAuthStore((s) => s.peran);

  const title =
    [...matches]
      .reverse()
      .map((match) => (match.handle as { title?: string } | undefined)?.title)
      .find(Boolean) ?? '';

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-slate-300/60 bg-card px-4 sm:px-6 print:hidden">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="rounded-card p-2 hover:bg-black/5 sm:hidden"
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

        <button type="button" className="relative rounded-card p-2 hover:bg-black/5" aria-label="Notifikasi">
          <Bell className="h-5 w-5 text-slate-700" />
        </button>

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
