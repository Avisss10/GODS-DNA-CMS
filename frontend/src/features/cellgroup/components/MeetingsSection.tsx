import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarClock, ImageIcon, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/EmptyState';
import { listMeetings } from '../cellgroup.api';
import MeetingFormModal from './MeetingFormModal';

interface MeetingsSectionProps {
  cgId: number;
  hasActiveLeader: boolean;
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MeetingsSection({ cgId, hasActiveLeader }: MeetingsSectionProps) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);

  const meetingsQuery = useQuery({
    queryKey: ['cellgroup', cgId, 'meetings'],
    queryFn: () => listMeetings(cgId, { limit: 50 }),
  });

  function handleCreated() {
    queryClient.invalidateQueries({ queryKey: ['cellgroup', cgId, 'meetings'] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Riwayat meeting Cell Group ini</p>

        {hasActiveLeader ? (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> Tambah Meeting
          </Button>
        ) : (
          <p className="max-w-xs text-right text-xs text-amber-600">
            CG belum punya leader aktif, tidak bisa membuat meeting
          </p>
        )}
      </div>

      {meetingsQuery.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-card" />
          ))}
        </div>
      )}

      {!meetingsQuery.isLoading && (meetingsQuery.data?.length ?? 0) === 0 && (
        <EmptyState icon={CalendarClock} title="Belum ada meeting tercatat" className="py-8" />
      )}

      {!meetingsQuery.isLoading && (meetingsQuery.data?.length ?? 0) > 0 && (
        <ul className="divide-y divide-slate-100 rounded-card border border-slate-200">
          {meetingsQuery.data!.map((m) => (
            <li key={m.id}>
              <Link
                to={`/cellgroup/meetings/${m.id}`}
                className="flex flex-col gap-1 px-4 py-3 text-sm hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-slate-800">{m.judul}</p>
                  <p className="flex items-center gap-1 text-xs text-slate-400">
                    <CalendarClock className="h-3 w-3" /> {formatDateTime(m.waktu_mulai)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{m.jenis}</Badge>
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <ImageIcon className="h-3.5 w-3.5" /> {m.jumlah_foto}/5
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <MeetingFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        mode="create"
        cgId={cgId}
        onSuccess={handleCreated}
      />
    </div>
  );
}