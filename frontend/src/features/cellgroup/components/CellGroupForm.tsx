import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listJemaat } from '@/features/jemaat/jemaat.api';
import { createCellGroup, updateCellGroup } from '../cellgroup.api';
import type { CellGroupDetail } from '@/types/cellgroup.types';
import JemaatSearchSelect from './JemaatSearchSelect';

const schema = z.object({
  nama: z.string().trim().min(1, 'Nama wajib diisi'),
  deskripsi: z.string().optional(),
  leaderId: z.number().nullable(),
});
type FormValues = z.infer<typeof schema>;

interface CellGroupFormProps {
  mode: 'create' | 'edit';
  cg?: CellGroupDetail;
  currentLeaderName?: string | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function CellGroupForm({ mode, cg, currentLeaderName, onSuccess, onCancel }: CellGroupFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dropdown leader diambil dari jemaat AKTIF (Tahap 3). Tidak difilter
  // "bukan leader CG lain" secara ketat di FE — diserahkan ke validasi
  // backend (sesuai opsi yang dibolehkan di prompt).
  const jemaatQuery = useQuery({
    queryKey: ['jemaat', 'list-all-active'],
    queryFn: () => listJemaat({ limit: 500 }),
  });

  const {
    handleSubmit,
    register,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nama: cg?.nama ?? '',
      deskripsi: cg?.deskripsi ?? '',
      leaderId: cg?.leader_id ?? null,
    },
  });

  const activeJemaatOptions = (jemaatQuery.data ?? [])
    .filter((j) => j.is_active)
    .map((j) => ({ id: j.id, label: j.nama }));

  // Kalau leader saat ini (edit mode) namanya sudah kita tahu tapi belum
  // tentu ada di 500 jemaat pertama, pastikan tetap muncul di opsi.
  const options =
    mode === 'edit' && cg?.leader_id && currentLeaderName && !activeJemaatOptions.some((o) => o.id === cg.leader_id)
      ? [{ id: cg.leader_id, label: currentLeaderName }, ...activeJemaatOptions]
      : activeJemaatOptions;

  async function onSubmit(values: FormValues) {
    if (values.leaderId == null) {
      toast.error('Leader wajib dipilih');
      return;
    }
    setIsSubmitting(true);
    try {
      if (mode === 'create') {
        await createCellGroup({
          nama: values.nama.trim(),
          deskripsi: values.deskripsi || undefined,
          leaderId: values.leaderId,
        });
        toast.success('Cell Group berhasil ditambahkan');
      } else {
        await updateCellGroup(cg!.id, {
          nama: values.nama.trim(),
          deskripsi: values.deskripsi || undefined,
          leader_id: values.leaderId,
        });
        toast.success('Cell Group berhasil diupdate');
      }
      onSuccess();
    } catch {
      toast.error('Terjadi kesalahan pada server, silakan coba lagi');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <fieldset disabled={isSubmitting} className="space-y-4">
        <div>
          <Label htmlFor="nama">Nama Cell Group *</Label>
          <Input id="nama" {...register('nama')} className="mt-1" />
          {errors.nama && <p className="mt-1 text-xs text-destructive">{errors.nama.message}</p>}
        </div>

        <div>
          <Label htmlFor="deskripsi">Deskripsi</Label>
          <textarea
            id="deskripsi"
            rows={3}
            {...register('deskripsi')}
            className="mt-1 flex w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div>
          <Label>Leader *</Label>
          <div className="mt-1">
            <Controller
              name="leaderId"
              control={control}
              render={({ field }) => (
                <JemaatSearchSelect
                  options={options}
                  value={field.value}
                  onChange={field.onChange}
                  isLoading={jemaatQuery.isLoading}
                  placeholder="Pilih leader..."
                />
              )}
            />
          </div>
        </div>
      </fieldset>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Batal
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Menyimpan...' : 'Simpan'}
        </Button>
      </div>
    </form>
  );
}