import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createMeeting, updateMeeting } from '../cellgroup.api';
import type { CgMeetingDetail, JenisMeeting } from '@/types/cellgroup.types';

const fieldClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const schema = z
  .object({
    judul: z.string().trim().min(1, 'Judul wajib diisi'),
    jenis: z.enum(['ONLINE', 'OFFLINE']),
    waktuMulai: z.string().min(1, 'Waktu mulai wajib diisi'),
    waktuSelesai: z.string().min(1, 'Waktu selesai wajib diisi'),
    catatan: z.string().optional(),
  })
  // Validasi client-side waktu_selesai > waktu_mulai, di samping validasi backend.
  .refine((v) => new Date(v.waktuSelesai) > new Date(v.waktuMulai), {
    message: 'Waktu selesai harus setelah waktu mulai',
    path: ['waktuSelesai'],
  });

type FormValues = z.infer<typeof schema>;

interface MeetingFormProps {
  mode: 'create' | 'edit';
  cgId?: number; // wajib untuk mode create
  meeting?: CgMeetingDetail; // wajib untuk mode edit
  onSuccess: () => void;
  onCancel: () => void;
}

// <input type="datetime-local"> butuh format 'YYYY-MM-DDTHH:mm'.
function toDatetimeLocal(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MeetingForm({ mode, cgId, meeting, onSuccess, onCancel }: MeetingFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      judul: meeting?.judul ?? '',
      jenis: (meeting?.jenis as JenisMeeting) ?? 'OFFLINE',
      waktuMulai: toDatetimeLocal(meeting?.waktu_mulai),
      waktuSelesai: toDatetimeLocal(meeting?.waktu_selesai),
      catatan: meeting?.catatan ?? '',
    },
  });

  // Payload CAMELCASE — dipakai KHUSUS untuk create. Jangan disatukan
  // dengan submitUpdate meski nilainya sama, karena kontrak backend beda casing.
  async function submitCreate(values: FormValues) {
    if (!cgId) return;
    await createMeeting(cgId, {
      judul: values.judul.trim(),
      jenis: values.jenis,
      waktuMulai: new Date(values.waktuMulai).toISOString(),
      waktuSelesai: new Date(values.waktuSelesai).toISOString(),
      catatan: values.catatan || undefined,
    });
    toast.success('Meeting berhasil dibuat');
  }

  // Payload SNAKE_CASE parsial — dipakai KHUSUS untuk update.
  async function submitUpdate(values: FormValues) {
    if (!meeting) return;
    await updateMeeting(meeting.id, {
      judul: values.judul.trim(),
      jenis: values.jenis,
      waktu_mulai: new Date(values.waktuMulai).toISOString(),
      waktu_selesai: new Date(values.waktuSelesai).toISOString(),
      catatan: values.catatan || undefined,
    });
    toast.success('Meeting berhasil diupdate');
  }

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    try {
      if (mode === 'create') {
        await submitCreate(values);
      } else {
        await submitUpdate(values);
      }
      onSuccess();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(message || 'Terjadi kesalahan pada server, silakan coba lagi');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <fieldset disabled={isSubmitting} className="space-y-4">
        <div>
          <Label htmlFor="judul">Judul *</Label>
          <Input id="judul" {...register('judul')} className="mt-1" />
          {errors.judul && <p className="mt-1 text-xs text-destructive">{errors.judul.message}</p>}
        </div>

        <div>
          <Label htmlFor="jenis">Jenis *</Label>
          <select id="jenis" {...register('jenis')} className={`${fieldClass} mt-1`}>
            <option value="OFFLINE">Offline</option>
            <option value="ONLINE">Online</option>
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="waktuMulai">Waktu Mulai *</Label>
            <Input id="waktuMulai" type="datetime-local" {...register('waktuMulai')} className="mt-1" />
            {errors.waktuMulai && <p className="mt-1 text-xs text-destructive">{errors.waktuMulai.message}</p>}
          </div>
          <div>
            <Label htmlFor="waktuSelesai">Waktu Selesai *</Label>
            <Input id="waktuSelesai" type="datetime-local" {...register('waktuSelesai')} className="mt-1" />
            {errors.waktuSelesai && (
              <p className="mt-1 text-xs text-destructive">{errors.waktuSelesai.message}</p>
            )}
          </div>
        </div>

        <div>
          <Label htmlFor="catatan">Catatan</Label>
          <textarea id="catatan" rows={3} {...register('catatan')} className={`${fieldClass} mt-1 min-h-20 py-1.5`} />
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