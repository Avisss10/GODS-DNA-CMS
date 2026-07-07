import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createVolunteerType, updateVolunteerType } from '../volunteer.api';
import type { VolunteerTypeListItem } from '@/types/volunteer.types';

const schema = z.object({
  nama: z.string().trim().min(1, 'Nama wajib diisi'),
  deskripsi: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

interface VolunteerTypeFormProps {
  mode: 'create' | 'edit';
  item?: VolunteerTypeListItem;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function VolunteerTypeForm({ mode, item, onSuccess, onCancel }: VolunteerTypeFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    handleSubmit,
    register,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nama: item?.nama ?? '',
      deskripsi: item?.deskripsi ?? '',
    },
  });

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    try {
      if (mode === 'create') {
        await createVolunteerType({
          nama: values.nama.trim(),
          deskripsi: values.deskripsi || undefined,
        });
        toast.success('Jenis volunteer berhasil ditambahkan');
      } else {
        await updateVolunteerType(item!.id, {
          nama: values.nama.trim(),
          deskripsi: values.deskripsi || undefined,
        });
        toast.success('Jenis volunteer berhasil diperbarui');
      }
      onSuccess();
    } catch (err) {
      if (isAxiosError<{ message?: string }>(err) && err.response?.status === 409) {
        toast.error(err.response.data?.message ?? 'Nama jenis volunteer sudah digunakan');
      } else {
        toast.error('Terjadi kesalahan pada server, silakan coba lagi');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <fieldset disabled={isSubmitting} className="space-y-4">
        <div>
          <Label htmlFor="nama">Nama Jenis Volunteer *</Label>
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