import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
  className?: string;
}

// Segmen terakhir selalu ditampilkan sebagai teks biasa (halaman aktif),
// segmen lain jadi link kalau punya `href`.
export default function Breadcrumb({ segments, className }: BreadcrumbProps) {
  if (segments.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn('flex flex-wrap items-center gap-1.5 text-sm print:hidden', className)}>
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={`${seg.label}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
            {seg.href && !isLast ? (
              <Link to={seg.href} className="text-slate-500 hover:text-accent-from hover:underline">
                {seg.label}
              </Link>
            ) : (
              <span className={cn(isLast ? 'font-medium text-slate-800' : 'text-slate-500')}>{seg.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}