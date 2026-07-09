import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/** Pola empty-state seragam — ikon muted + judul + deskripsi kecil + aksi opsional. */
export default function EmptyState({ icon: Icon = Inbox, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-2 rounded-card border border-dashed border-slate-300 py-16 text-center', className)}>
      <Icon className="h-10 w-10 text-slate-300" />
      <p className="font-medium text-slate-600">{title}</p>
      {description && <p className="max-w-sm text-xs text-slate-400">{description}</p>}
      {action}
    </div>
  );
}
