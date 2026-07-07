import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchSelectOption {
  id: number;
  label: string;
  sublabel?: string;
}

interface JemaatSearchSelectProps {
  options: SearchSelectOption[];
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  isLoading?: boolean;
  disabled?: boolean;
  emptyText?: string;
}

export default function JemaatSearchSelect({
  options,
  value,
  onChange,
  placeholder = 'Cari jemaat...',
  isLoading = false,
  disabled = false,
  emptyText = 'Tidak ada jemaat ditemukan',
}: JemaatSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return options;
    return options.filter((o) => o.label.toLowerCase().includes(t));
  }, [options, term]);

  const selected = options.find((o) => o.id === value) ?? null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <span className={selected ? 'text-slate-800' : 'text-muted-foreground'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
          <div className="relative border-b border-slate-100 p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Ketik untuk mencari..."
              className="w-full rounded-md border border-slate-200 py-1.5 pl-7 pr-2 text-sm focus:outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {isLoading && (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Memuat...
              </div>
            )}
            {!isLoading && filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-slate-400">{emptyText}</p>
            )}
            {!isLoading &&
              filtered.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onChange(opt.id);
                    setTerm('');
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span>
                    {opt.label}
                    {opt.sublabel && <span className="ml-1 text-xs text-slate-400">{opt.sublabel}</span>}
                  </span>
                  {value === opt.id && <Check className="h-4 w-4 text-accent-from" />}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}