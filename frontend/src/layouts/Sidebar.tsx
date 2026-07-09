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

interface MenuItemDef {
  label: string;
  to: string;
  icon: LucideIcon;
  chipClass: string;
  iconClass: string;
  leaderOnly?: boolean;
}

const MENU_ITEMS: MenuItemDef[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, chipClass: 'bg-slate-500/15', iconClass: 'text-slate-600' },
  { label: 'Jemaat', to: '/jemaat', icon: Users, chipClass: 'bg-modul-jemaat/15', iconClass: 'text-modul-jemaat' },
  { label: 'Cell Group', to: '/cellgroup', icon: UsersRound, chipClass: 'bg-modul-cellgroup/15', iconClass: 'text-modul-cellgroup' },
  { label: 'Event', to: '/event', icon: CalendarDays, chipClass: 'bg-modul-event/15', iconClass: 'text-modul-event' },
  { label: 'Volunteer', to: '/volunteer', icon: HandHeart, chipClass: 'bg-modul-volunteer/15', iconClass: 'text-modul-volunteer' },
  { label: 'Report', to: '/report', icon: BarChart3, chipClass: 'bg-modul-report/15', iconClass: 'text-modul-report' },
  { label: 'Audit Log', to: '/audit-log', icon: ScrollText, chipClass: 'bg-modul-auditlog/15', iconClass: 'text-modul-auditlog', leaderOnly: true },
  { label: 'Notification', to: '/notification', icon: Bell, chipClass: 'bg-slate-500/15', iconClass: 'text-slate-600', leaderOnly: true },
  { label: 'User Management', to: '/user-management', icon: UserCog, chipClass: 'bg-slate-500/15', iconClass: 'text-slate-600', leaderOnly: true },
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
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar-gradient shadow-sidebar transition-transform duration-200 sm:static sm:z-auto sm:w-16 sm:translate-x-0 lg:w-64 print:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 shrink-0 items-center px-4">
          <img src={gwLogoSlate} alt="GOD'S DNA Grand Wisata" className="h-6 w-auto sm:hidden lg:block" />
          <span className="hidden text-lg font-bold text-slate-800 sm:inline lg:hidden">GD</span>
        </div>

        <TooltipProvider delayDuration={200}>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
            {visibleItems.map((item) => (
              <Tooltip key={item.to}>
                <TooltipTrigger asChild>
                  <NavLink
                    to={item.to}
                    onClick={onCloseMobile}
                    aria-label={item.label}
                    className={({ isActive }) =>
                      cn(
                        'relative flex items-center gap-3 rounded-card px-2.5 py-2 text-sm font-medium transition-smooth',
                        isActive
                          ? 'bg-gradient-to-r from-accent-from to-accent-to text-white shadow-soft'
                          : 'text-slate-700 hover:bg-black/5',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent-from sm:hidden lg:block" />
                        )}
                        <span
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-card transition-smooth',
                            isActive ? 'bg-white/20' : item.chipClass,
                          )}
                        >
                          <item.icon className={cn('h-4 w-4', isActive ? 'text-white' : item.iconClass)} />
                        </span>
                        <span className="truncate sm:hidden lg:inline">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            ))}
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