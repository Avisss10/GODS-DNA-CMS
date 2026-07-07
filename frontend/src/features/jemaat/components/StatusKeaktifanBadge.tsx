import { cn } from '@/lib/utils';
import type { StatusKeaktifan } from '@/types/jemaat.types';
import { STATUS_BADGE_CLASSES, STATUS_DOT_CLASSES, STATUS_LABELS } from '../jemaat.constants';

interface StatusKeaktifanBadgeProps {
  status: StatusKeaktifan;
  className?: string;
}

export default function StatusKeaktifanBadge({ status, className }: StatusKeaktifanBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold',
        STATUS_BADGE_CLASSES[status],
        className,
      )}
    >
      {status === 'AKTIF' && (
        <span className="relative flex h-1.5 w-1.5">
          <span
            className={cn(
              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
              STATUS_DOT_CLASSES[status],
            )}
          />
          <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', STATUS_DOT_CLASSES[status])} />
        </span>
      )}
      {STATUS_LABELS[status]}
    </span>
  );
}