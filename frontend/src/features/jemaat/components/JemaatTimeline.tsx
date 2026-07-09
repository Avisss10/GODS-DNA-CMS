import { CalendarDays, HandHeart, History, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/EmptyState';
import { cn } from '@/lib/utils';

export interface TimelineEntry {
  id: string;
  date: string;
  type: 'cg' | 'event' | 'volunteer';
  title: string;
  subtitle?: string;
}

// Warna dibuat konsisten dengan token modul yang sudah dipakai di Sidebar
// (modul.cellgroup / modul.event / modul.volunteer), bukan warna literal.
const TYPE_CONFIG = {
  cg: { icon: Users, text: 'text-modul-cellgroup', chip: 'bg-modul-cellgroup/15' },
  event: { icon: CalendarDays, text: 'text-modul-event', chip: 'bg-modul-event/15' },
  volunteer: { icon: HandHeart, text: 'text-modul-volunteer', chip: 'bg-modul-volunteer/15' },
} as const;

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface JemaatTimelineProps {
  entries: TimelineEntry[];
  isLoading: boolean;
}

export default function JemaatTimeline({ entries, isLoading }: JemaatTimelineProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-card" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return <EmptyState icon={History} title="Belum ada aktivitas tercatat" className="border-none py-6" />;
  }

  return (
    <ol className="relative space-y-5 border-l border-slate-200 pl-6">
      {entries.map((entry) => {
        const config = TYPE_CONFIG[entry.type];
        const Icon = config.icon;
        return (
          <li key={entry.id} className="relative">
            <span
              className={cn(
                'absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full',
                config.chip,
              )}
            >
              <Icon className={cn('h-3.5 w-3.5', config.text)} />
            </span>
            <p className="text-xs text-slate-400">{formatDate(entry.date)}</p>
            <p className="font-medium text-slate-800">{entry.title}</p>
            {entry.subtitle && <p className="text-sm text-slate-500">{entry.subtitle}</p>}
          </li>
        );
      })}
    </ol>
  );
}