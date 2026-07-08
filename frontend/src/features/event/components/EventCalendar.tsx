import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getEventStatusVariant } from '../event.utils';
import type { EventListItem } from '@/types/event.types';

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTH_LABELS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface EventCalendarProps {
  events: EventListItem[];
}

export default function EventCalendar({ events }: EventCalendarProps) {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventListItem[]>();
    for (const e of events) {
      const key = dateKey(new Date(e.waktu_mulai));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events]);

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay(); // 0 = Minggu
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const items: { date: Date; inMonth: boolean }[] = [];

    // Padding hari dari bulan sebelumnya
    for (let i = startOffset - 1; i >= 0; i--) {
      items.push({ date: new Date(year, month, -i), inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      items.push({ date: new Date(year, month, d), inMonth: true });
    }
    // Padding hari dari bulan berikutnya sampai genap 6 baris (42 sel)
    while (items.length < 42) {
      const last = items[items.length - 1].date;
      items.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false });
    }
    return items;
  }, [cursor]);

  const today = dateKey(new Date());

  return (
    <div className="rounded-card border border-slate-200 bg-white p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">
          {MONTH_LABELS[cursor.getMonth()]} {cursor.getFullYear()}
        </h3>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
            aria-label="Bulan sebelumnya"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
            Hari Ini
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
            aria-label="Bulan berikutnya"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-slate-100 bg-slate-100 text-center text-xs font-medium text-slate-500">
        {DAY_LABELS.map((d) => (
          <div key={d} className="bg-slate-50 py-1.5">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-t-0 border-slate-100 bg-slate-100">
        {cells.map(({ date, inMonth }) => {
          const key = dateKey(date);
          const dayEvents = eventsByDate.get(key) ?? [];
          const isToday = key === today;
          return (
            <div
              key={key}
              className={cn('min-h-[84px] bg-white p-1.5', !inMonth && 'bg-slate-50/60')}
            >
              <span
                className={cn(
                  'inline-flex h-5 w-5 items-center justify-center rounded-full text-xs',
                  isToday ? 'bg-modul-event text-white font-semibold' : inMonth ? 'text-slate-700' : 'text-slate-300',
                )}
              >
                {date.getDate()}
              </span>
              <div className="mt-1 space-y-1">
                {dayEvents.slice(0, 3).map((ev) => {
                  const variant = getEventStatusVariant(ev.status);
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => navigate(`/event/${ev.id}`)}
                      title={ev.judul}
                      className={cn(
                        'block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium hover:opacity-80',
                        variant.className,
                      )}
                    >
                      {ev.judul}
                    </button>
                  );
                })}
                {dayEvents.length > 3 && (
                  <p className="px-1.5 text-[10px] text-slate-400">+{dayEvents.length - 3} lainnya</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}