import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Search, UserCog, Users, UsersRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { listJemaat } from '@/features/jemaat/jemaat.api';
import { listEvents } from '@/features/event/event.api';
import { listCellGroups } from '@/features/cellgroup/cellgroup.api';
import { listUsers } from '@/features/user/user.api';
import { formatEventDate } from '@/features/event/event.utils';

type Category = 'Jemaat' | 'Event' | 'Cell Group' | 'User';

interface PaletteItem {
  id: string;
  category: Category;
  primary: string;
  secondary?: string;
  href: string;
  icon: typeof Users;
  iconClass: string;
  chipClass: string;
}

const DEBOUNCE_MS = 300;
const CATEGORY_ORDER: Category[] = ['Jemaat', 'Event', 'Cell Group', 'User'];

export default function CommandPalette() {
  const navigate = useNavigate();
  const peran = useAuthStore((s) => s.peran);
  const [open, setOpen] = useState(false);
  const [queryInput, setQueryInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Shortcut global Ctrl+K / Cmd+K — cegah default browser (biasanya
  // fokus ke address bar).
  useEffect(() => {
    function handleGlobalKeydown(e: globalThis.KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', handleGlobalKeydown);
    return () => window.removeEventListener('keydown', handleGlobalKeydown);
  }, []);

  useEffect(() => {
    if (open) {
      setQueryInput('');
      setDebouncedQuery('');
      setHighlightIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(queryInput), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [debouncedQuery]);

  // Query key SAMA dengan halaman list masing-masing modul — kalau
  // halaman itu sudah pernah dibuka, React Query kena cache (tidak
  // fetch ulang saat palette dibuka).
  const jemaatQuery = useQuery({
    queryKey: ['jemaat', 'list-all'],
    queryFn: () => listJemaat({ limit: 500 }),
    enabled: open,
    staleTime: 60_000,
  });
  const eventQuery = useQuery({
    queryKey: ['event', 'list'],
    queryFn: () => listEvents(),
    enabled: open,
    staleTime: 60_000,
  });
  const cgQuery = useQuery({
    queryKey: ['cellgroup', 'list'],
    queryFn: () => listCellGroups({ limit: 200 }),
    enabled: open,
    staleTime: 60_000,
  });
  const userQuery = useQuery({
    queryKey: ['users', 'list'],
    queryFn: listUsers,
    enabled: open && peran === 'LEADER',
    staleTime: 60_000,
  });

  const results = useMemo<PaletteItem[]>(() => {
    const term = debouncedQuery.trim().toLowerCase();
    if (!term) return [];

    const items: PaletteItem[] = [];

    for (const j of jemaatQuery.data ?? []) {
      if (j.nama.toLowerCase().includes(term)) {
        items.push({
          id: `jemaat-${j.id}`,
          category: 'Jemaat',
          primary: j.nama,
          secondary: j.status_keaktifan.replace(/_/g, ' '),
          href: `/jemaat/${j.id}`,
          icon: Users,
          iconClass: 'text-modul-jemaat',
          chipClass: 'bg-modul-jemaat/15',
        });
      }
    }

    for (const ev of eventQuery.data ?? []) {
      if (ev.judul.toLowerCase().includes(term)) {
        items.push({
          id: `event-${ev.id}`,
          category: 'Event',
          primary: ev.judul,
          secondary: formatEventDate(ev.waktu_mulai),
          href: `/event/${ev.id}`,
          icon: CalendarDays,
          iconClass: 'text-modul-event',
          chipClass: 'bg-modul-event/15',
        });
      }
    }

    for (const cg of cgQuery.data ?? []) {
      if (cg.nama.toLowerCase().includes(term)) {
        items.push({
          id: `cellgroup-${cg.id}`,
          category: 'Cell Group',
          primary: cg.nama,
          secondary: cg.nama_leader ? `Leader: ${cg.nama_leader}` : undefined,
          href: `/cellgroup/${cg.id}`,
          icon: UsersRound,
          iconClass: 'text-modul-cellgroup',
          chipClass: 'bg-modul-cellgroup/15',
        });
      }
    }

    if (peran === 'LEADER') {
      for (const u of userQuery.data ?? []) {
        if (u.username.toLowerCase().includes(term)) {
          items.push({
            id: `user-${u.id}`,
            category: 'User',
            primary: u.username,
            secondary: u.peran,
            href: '/user-management',
            icon: UserCog,
            iconClass: 'text-slate-600',
            chipClass: 'bg-slate-500/15',
          });
        }
      }
    }

    return items;
  }, [debouncedQuery, jemaatQuery.data, eventQuery.data, cgQuery.data, userQuery.data, peran]);

  // Dikelompokkan per kategori dengan urutan tetap; index global tiap item
  // disimpan untuk navigasi keyboard (arrow up/down harus lintas kategori).
  const grouped = useMemo(() => {
    let idx = 0;
    return CATEGORY_ORDER.map((category) => {
      const items = results.filter((r) => r.category === category).map((item) => ({ item, index: idx++ }));
      return { category, items };
    }).filter((g) => g.items.length > 0);
  }, [results]);

  function closePalette() {
    setOpen(false);
  }

  function goToItem(item: PaletteItem) {
    navigate(item.href);
    closePalette();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[highlightIndex];
      if (item) goToItem(item);
    } else if (e.key === 'Escape') {
      closePalette();
    }
  }

  const isLoading =
    debouncedQuery.trim() !== '' &&
    (jemaatQuery.isLoading || eventQuery.isLoading || cgQuery.isLoading || (peran === 'LEADER' && userQuery.isLoading));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-900/50 p-4 pt-24 backdrop-blur-sm" onClick={closePalette}>
      <div className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200/70 bg-card shadow-popover" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-200 px-4">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Cari jemaat, event, cell group..."
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          <kbd className="hidden shrink-0 rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-400 sm:inline">
            Esc
          </kbd>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {debouncedQuery.trim() === '' && (
            <p className="px-2 py-6 text-center text-sm text-slate-400">
              Ketik untuk mencari jemaat, event, atau cell group...
            </p>
          )}

          {debouncedQuery.trim() !== '' && isLoading && (
            <p className="px-2 py-6 text-center text-sm text-slate-400">Mencari...</p>
          )}

          {debouncedQuery.trim() !== '' && !isLoading && results.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-slate-400">
              Tidak ada hasil untuk '{debouncedQuery.trim()}'
            </p>
          )}

          {grouped.map((group) => (
            <div key={group.category} className="mb-2 last:mb-0">
              <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{group.category}</p>
              {group.items.map(({ item, index }) => {
                const isHighlighted = index === highlightIndex;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseEnter={() => setHighlightIndex(index)}
                    onClick={() => goToItem(item)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-smooth',
                      isHighlighted ? 'bg-accent-from/10' : 'hover:bg-slate-50',
                    )}
                  >
                    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-card', item.chipClass)}>
                      <Icon className={cn('h-4 w-4', item.iconClass)} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-800">{item.primary}</span>
                      {item.secondary && <span className="block truncate text-xs text-slate-500">{item.secondary}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-xs text-slate-400">
          <span>↑↓ navigasi</span>
          <span>Enter pilih</span>
          <span>Esc tutup</span>
        </div>
      </div>
    </div>
  );
}