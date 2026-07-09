import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/EmptyState';
import { getVolunteerNeeds } from '../event.api';
import { VOLUNTEER_MUTABLE_STATUSES } from '@/types/event.types';
import type { EventStatus } from '@/types/event.types';
import EditNeedsModal from './EditNeedsModal';

interface VolunteerNeedsSectionProps {
  eventId: number;
  eventStatus: EventStatus;
}

export default function VolunteerNeedsSection({ eventId, eventStatus }: VolunteerNeedsSectionProps) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const needsQuery = useQuery({
    queryKey: ['event', eventId, 'volunteer-needs'],
    queryFn: () => getVolunteerNeeds(eventId),
  });

  const canEdit = VOLUNTEER_MUTABLE_STATUSES.includes(eventStatus);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['event', eventId, 'volunteer-needs'] });
  }

  const needs = needsQuery.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Kuota kebutuhan volunteer per jenis pelayanan. Jenis tanpa kuota berarti tanpa batas penugasan.
        </p>
        <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} disabled={!canEdit}>
          <Pencil className="h-3.5 w-3.5" />
          Edit Kebutuhan
        </Button>
      </div>

      {needsQuery.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-card" />
          ))}
        </div>
      )}

      {!needsQuery.isLoading && needs.length === 0 && (
        <EmptyState icon={ClipboardList} title="Belum ada kuota yang diset — penugasan bebas tanpa batas." className="py-8" />
      )}

      {!needsQuery.isLoading && needs.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-card border border-slate-200">
          {needs.map((n) => {
            const percent = n.kuota > 0 ? Math.min(100, Math.round((n.jumlah_terisi / n.kuota) * 100)) : 0;
            const isFull = n.jumlah_terisi >= n.kuota;
            return (
              <li key={n.id} className="px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-800">{n.nama_jenis}</span>
                  <span className={isFull ? 'font-medium text-status-aktifText' : 'text-slate-500'}>
                    Terisi {n.jumlah_terisi} dari {n.kuota}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-modul-event"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!canEdit && (
        <p className="text-xs text-slate-400">
          Kebutuhan volunteer tidak dapat diubah setelah event berstatus Selesai/Diarsipkan.
        </p>
      )}

      <EditNeedsModal
        open={editOpen}
        eventId={eventId}
        currentNeeds={needs}
        onOpenChange={setEditOpen}
        onSuccess={refresh}
      />
    </div>
  );
}