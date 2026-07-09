import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { HandHeart, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/EmptyState';
import { listVolunteerByJemaat } from '@/features/volunteer/volunteer.api';
import { listVolunteerTypes, unregisterVolunteer } from '@/features/volunteer/volunteer.api';
import type { JemaatVolunteerHistory } from '@/types/volunteer.types';
import VolunteerRegisterModal from './VolunteerRegisterModal';
import UnregisterVolunteerDialog from './UnregisterVolunteerDialog';

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

interface JemaatVolunteerSectionProps {
  jemaatId: number;
}

export default function JemaatVolunteerSection({ jemaatId }: JemaatVolunteerSectionProps) {
  const queryClient = useQueryClient();

  const [registerOpen, setRegisterOpen] = useState(false);
  const [unregisterTarget, setUnregisterTarget] = useState<JemaatVolunteerHistory | null>(null);
  const [isUnregistering, setIsUnregistering] = useState(false);

  const registeredQuery = useQuery({
    queryKey: ['jemaat', jemaatId, 'volunteer'],
    queryFn: () => listVolunteerByJemaat(jemaatId),
  });

  const typesQuery = useQuery({
    queryKey: ['volunteer-types', 'list'],
    queryFn: listVolunteerTypes,
  });

  function invalidateAll() {
    // Sinkron dua arah: profil jemaat & halaman master jenis volunteer
    // sama-sama pakai jumlah_anggota, jadi keduanya harus di-refetch.
    queryClient.invalidateQueries({ queryKey: ['jemaat', jemaatId, 'volunteer'] });
    queryClient.invalidateQueries({ queryKey: ['volunteer-types', 'list'] });
  }

  const registeredIds = new Set((registeredQuery.data ?? []).map((v) => v.volunteer_type_id));
  const availableOptions = (typesQuery.data ?? []).filter(
    (t) => t.is_active && !registeredIds.has(t.id),
  );

  async function handleConfirmUnregister() {
    if (!unregisterTarget) return;
    setIsUnregistering(true);
    try {
      await unregisterVolunteer(jemaatId, unregisterTarget.volunteer_type_id);
      toast.success('Jemaat berhasil dikeluarkan dari jenis volunteer ini');
      invalidateAll();
      setUnregisterTarget(null);
    } catch {
      toast.error('Gagal mengeluarkan jemaat dari jenis volunteer');
    } finally {
      setIsUnregistering(false);
    }
  }

  const isLoading = registeredQuery.isLoading || typesQuery.isLoading;
  const isEmpty = !isLoading && (registeredQuery.data?.length ?? 0) === 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Jenis volunteer yang diikuti jemaat ini</p>
        <Button size="sm" onClick={() => setRegisterOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Daftarkan ke Jenis Volunteer
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-card" />
          ))}
        </div>
      )}

      {isEmpty && (
        <EmptyState icon={HandHeart} title="Belum terdaftar di jenis volunteer manapun" className="py-10" />
      )}

      {!isLoading && !isEmpty && (
        <ul className="divide-y divide-slate-100 rounded-card border border-slate-200">
          {registeredQuery.data!.map((v) => (
            <li key={v.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium text-slate-800">{v.nama}</p>
                <p className="text-xs text-slate-500">Bergabung sejak {formatDate(v.joined_at)}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUnregisterTarget(v)}
              >
                <X className="h-3.5 w-3.5" />
                Keluarkan
              </Button>
            </li>
          ))}
        </ul>
      )}

      <VolunteerRegisterModal
        open={registerOpen}
        jemaatId={jemaatId}
        options={availableOptions}
        onOpenChange={setRegisterOpen}
        onSuccess={invalidateAll}
      />

      <UnregisterVolunteerDialog
        open={!!unregisterTarget}
        namaJenis={unregisterTarget?.nama ?? null}
        isSubmitting={isUnregistering}
        onOpenChange={(open) => {
          if (!open) setUnregisterTarget(null);
        }}
        onConfirm={handleConfirmUnregister}
      />
    </div>
  );
}