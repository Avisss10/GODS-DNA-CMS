import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { HandHeart, Plus, Repeat, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/EmptyState';
import { listEventVolunteers, getVolunteerNeeds, cancelVolunteer } from '../event.api';
import { listVolunteerTypes } from '@/features/volunteer/volunteer.api';
import { VOLUNTEER_MUTABLE_STATUSES } from '@/types/event.types';
import type { EventStatus, EventVolunteer } from '@/types/event.types';
import AssignVolunteerModal from './AssignVolunteerModal';
import ReplaceVolunteerModal from './ReplaceVolunteerModal';
import CancelVolunteerDialog from './CancelVolunteerDialog';

interface VolunteerAssignmentSectionProps {
  eventId: number;
  eventStatus: EventStatus;
}

interface JenisGroup {
  jenisId: number;
  namaJenis: string;
  kuota: number | null; // null = tanpa batas
  assignments: EventVolunteer[];
}

export default function VolunteerAssignmentSection({ eventId, eventStatus }: VolunteerAssignmentSectionProps) {
  const queryClient = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignPresetJenis, setAssignPresetJenis] = useState<number | undefined>(undefined);
  const [assignPresetJenisLabel, setAssignPresetJenisLabel] = useState<string | undefined>(undefined);
  const [replaceTarget, setReplaceTarget] = useState<EventVolunteer | null>(null);
  const [cancelTarget, setCancelTarget] = useState<EventVolunteer | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const volunteersQuery = useQuery({
    queryKey: ['event', eventId, 'volunteers'],
    queryFn: () => listEventVolunteers(eventId),
  });
  const needsQuery = useQuery({
    queryKey: ['event', eventId, 'volunteer-needs'],
    queryFn: () => getVolunteerNeeds(eventId),
  });
  // Jenis nonaktif sengaja tidak muncul sbg opsi assignment baru.
  const typesQuery = useQuery({
    queryKey: ['volunteer-types', 'list'],
    queryFn: listVolunteerTypes,
  });

  const canMutate = VOLUNTEER_MUTABLE_STATUSES.includes(eventStatus);

  const groups: JenisGroup[] = useMemo(() => {
    const assignments = volunteersQuery.data ?? [];
    const needs = needsQuery.data ?? [];
    const map = new Map<number, JenisGroup>();

    for (const n of needs) {
      map.set(n.volunteer_type_id, { jenisId: n.volunteer_type_id, namaJenis: n.nama_jenis, kuota: n.kuota, assignments: [] });
    }
    for (const a of assignments) {
      if (!map.has(a.jenis_id)) {
        map.set(a.jenis_id, { jenisId: a.jenis_id, namaJenis: a.nama_jenis, kuota: null, assignments: [] });
      }
      map.get(a.jenis_id)!.assignments.push(a);
    }
    return Array.from(map.values()).sort((a, b) => a.namaJenis.localeCompare(b.namaJenis));
  }, [volunteersQuery.data, needsQuery.data]);

  const activeJenisOptions = (typesQuery.data ?? [])
    .filter((t) => t.is_active)
    .map((t) => ({ id: t.id, label: t.nama }));

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['event', eventId, 'volunteers'] });
    queryClient.invalidateQueries({ queryKey: ['event', eventId, 'volunteer-needs'] });
  }

  function openAssign(jenisId?: number, jenisLabel?: string) {
    setAssignPresetJenis(jenisId);
    setAssignPresetJenisLabel(jenisLabel);
    setAssignOpen(true);
  }

  async function handleConfirmCancel() {
    if (!cancelTarget) return;
    setIsCancelling(true);
    try {
      await cancelVolunteer(eventId, cancelTarget.id);
      toast.success('Penugasan berhasil dibatalkan');
      refresh();
      setCancelTarget(null);
    } catch {
      toast.error('Gagal membatalkan penugasan');
    } finally {
      setIsCancelling(false);
    }
  }

  const isLoading = volunteersQuery.isLoading || needsQuery.isLoading;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Penugasan volunteer aktif, dikelompokkan per jenis pelayanan.</p>
        <Button size="sm" onClick={() => openAssign(undefined, undefined)} disabled={!canMutate || activeJenisOptions.length === 0}>
          <Plus className="h-3.5 w-3.5" />
          Tugaskan
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-card" />
          ))}
        </div>
      )}

      {!isLoading && groups.length === 0 && (
        <EmptyState icon={HandHeart} title="Belum ada volunteer yang ditugaskan." className="py-10" />
      )}

      {!isLoading &&
        groups.map((g) => {
          // Jenis yang sudah dinonaktifkan tetap tampil (histori penugasan
          // lama), tapi tidak boleh ditambah assignment baru lagi.
          const isJenisActive = activeJenisOptions.some((o) => o.id === g.jenisId);
          return (
          <div key={g.jenisId} className="rounded-card border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <div>
                <p className="text-sm font-semibold text-slate-800">{g.namaJenis}</p>
                <p className="text-xs text-slate-500">
                  {g.assignments.length} bertugas{g.kuota !== null ? ` dari kuota ${g.kuota}` : ' (tanpa batas)'}
                </p>
              </div>
              {isJenisActive && (
                <Button size="sm" variant="outline" onClick={() => openAssign(g.jenisId, g.namaJenis)} disabled={!canMutate}>
                  <Plus className="h-3.5 w-3.5" /> Tugaskan
                </Button>
              )}
            </div>
            {g.assignments.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-400">Belum ada yang ditugaskan pada jenis ini.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {g.assignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <span className="text-sm text-slate-700">{a.nama_jemaat}</span>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setReplaceTarget(a)} disabled={!canMutate}>
                        <Repeat className="h-3.5 w-3.5" /> Ganti
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive hover:bg-destructive/5" onClick={() => setCancelTarget(a)} disabled={!canMutate}>
                        <X className="h-3.5 w-3.5" /> Batalkan
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          );
        })}

      {!canMutate && (
        <p className="text-xs text-slate-400">
          Penugasan volunteer terkunci setelah event berstatus Selesai/Diarsipkan.
        </p>
      )}

      <AssignVolunteerModal
        open={assignOpen}
        eventId={eventId}
        jenisOptions={activeJenisOptions}
        defaultJenisId={assignPresetJenis}
        defaultJenisLabel={assignPresetJenisLabel}
        onOpenChange={setAssignOpen}
        onSuccess={refresh}
      />
      <ReplaceVolunteerModal
        open={!!replaceTarget}
        eventId={eventId}
        assignment={replaceTarget}
        onOpenChange={(v) => !v && setReplaceTarget(null)}
        onSuccess={refresh}
      />
      <CancelVolunteerDialog
        open={!!cancelTarget}
        assignment={cancelTarget}
        isSubmitting={isCancelling}
        onOpenChange={(v) => !v && setCancelTarget(null)}
        onConfirm={handleConfirmCancel}
      />
    </div>
  );
}