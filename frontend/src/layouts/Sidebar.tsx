import {
  BarChart3,
  Bell,
  CalendarDays,
  HandHeart,
  LayoutDashboard,
  LogOut,
  ScrollText,
  UserCog,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import gwLogoSlate from '@/assets/brand/gw-logo-slate.png';

type MenuColor = 'neutral' | 'jemaat' | 'cellgroup' | 'event' | 'volunteer' | 'report' | 'auditlog';

interface MenuItemDef {
  label: string;
  to: string;
  icon: LucideIcon;
  color: MenuColor;
  leaderOnly?: boolean;
}

const COLOR_MAP: Record<MenuColor, { chip: string; icon: string; activeBg: string; accentBar: string }> = {
  neutral: { chip: 'bg-slate-500/15', icon: 'text-slate-600', activeBg: 'bg-slate-600', accentBar: 'bg-slate-600' },
  jemaat: { chip: 'bg-modul-jemaat/15', icon: 'text-modul-jemaat', activeBg: 'bg-modul-jemaat', accentBar: 'bg-modul-jemaat' },
  cellgroup: { chip: 'bg-modul-cellgroup/15', icon: 'text-modul-cellgroup', activeBg: 'bg-modul-cellgroup', accentBar: 'bg-modul-cellgroup' },
  event: { chip: 'bg-modul-event/15', icon: 'text-modul-event', activeBg: 'bg-modul-event', accentBar: 'bg-modul-event' },
  volunteer: { chip: 'bg-modul-volunteer/15', icon: 'text-modul-volunteer', activeBg: 'bg-modul-volunteer', accentBar: 'bg-modul-volunteer' },
  report: { chip: 'bg-modul-report/15', icon: 'text-modul-report', activeBg: 'bg-modul-report', accentBar: 'bg-modul-report' },
  auditlog: { chip: 'bg-modul-auditlog/15', icon: 'text-modul-auditlog', activeBg: 'bg-modul-auditlog', accentBar: 'bg-modul-auditlog' },
};

const MENU_ITEMS: MenuItemDef[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, color: 'neutral' },
  { label: 'Jemaat', to: '/jemaat', icon: Users, color: 'jemaat' },
  { label: 'Cell Group', to: '/cellgroup', icon: UsersRound, color: 'cellgroup' },
  { label: 'Event', to: '/event', icon: CalendarDays, color: 'event' },
  { label: 'Volunteer', to: '/volunteer', icon: HandHeart, color: 'volunteer' },
  { label: 'Report', to: '/report', icon: BarChart3, color: 'report' },
  { label: 'Audit Log', to: '/audit-log', icon: ScrollText, color: 'auditlog', leaderOnly: true },
  { label: 'Notification', to: '/notification', icon: Bell, color: 'neutral', leaderOnly: true },
  { label: 'User Management', to: '/user-management', icon: UserCog, color: 'neutral', leaderOnly: true },
];

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onRequestLogout: () => void;
}

export default function Sidebar({ mobileOpen, onCloseMobile, onRequestLogout }: SidebarProps) {
  const peran = useAuthStore((s) => s.peran);
  const visibleItems = MENU_ITEMS.filter((item) => !item.leaderOnly || peran === 'LEADER');

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 sm:hidden print:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar-gradient shadow-sidebar transition-transform duration-200 sm:sticky sm:top-0 sm:z-auto sm:h-screen sm:w-16 sm:translate-x-0 sm:self-start lg:w-64 print:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-center px-4 sm:px-0 lg:justify-start lg:px-4">
          <img src={gwLogoSlate} alt="GOD'S DNA Grand Wisata" className="h-6 w-auto sm:hidden lg:block" />
          <span className="hidden text-base font-bold text-slate-800 sm:inline lg:hidden">GD</span>
        </div>

        <TooltipProvider delayDuration={200}>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
            {visibleItems.map((item) => {
              const colors = COLOR_MAP[item.color];
              return (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>
                    <NavLink
                      to={item.to}
                      onClick={onCloseMobile}
                      aria-label={item.label}
                      className={({ isActive }) =>
                        cn(
                          'relative flex items-center gap-3 rounded-card px-2.5 py-2 text-sm font-medium transition-smooth',
                          isActive ? cn(colors.activeBg, 'text-white shadow-soft') : 'text-slate-700 hover:bg-black/5',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span
                              className={cn(
                                'absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full sm:hidden lg:block',
                                colors.accentBar,
                              )}
                            />
                          )}
                          <span
                            className={cn(
                              'flex h-8 w-8 shrink-0 items-center justify-center rounded-card transition-smooth',
                              isActive ? 'bg-white/20' : colors.chip,
                            )}
                          >
                            <item.icon className={cn('h-4 w-4', isActive ? 'text-white' : colors.icon)} />
                          </span>
                          <span className="truncate sm:hidden lg:inline">{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </nav>
        </TooltipProvider>

        <div className="shrink-0 px-3 pb-4">
          <hr className="mb-2 border-slate-400/40" />
          <button
            type="button"
            aria-label="Keluar dari akun"
            onClick={() => {
              onCloseMobile();
              onRequestLogout();
            }}
            className="flex w-full items-center gap-3 rounded-card px-2.5 py-2 text-sm font-medium text-slate-700 transition-smooth hover:bg-black/5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-card bg-red-100">
              <LogOut className="h-4 w-4 text-red-600" />
            </span>
            <span className="truncate sm:hidden lg:inline">Keluar</span>
          </button>
        </div>
      </aside>
    </>
  );
}