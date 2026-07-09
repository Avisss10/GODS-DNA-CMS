import { cn } from '@/lib/utils';
import PulsingDot from '@/components/PulsingDot';
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
      {status === 'AKTIF' && <PulsingDot colorClass={STATUS_DOT_CLASSES[status]} />}
      {STATUS_LABELS[status]}
    </span>
  );
}