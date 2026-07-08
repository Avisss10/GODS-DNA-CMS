import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createEvent, updateEvent } from '../event.api';
import type { EventDetail } from '@/types/event.types';

// Format datetime-local butuh 'YYYY-MM-DDTHH:mm', bukan ISO penuh.
function toDatetimeLocal(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const schema = z
  .object({
    judul: z.string().trim().min(1, 'Judul wajib diisi'),
    jenis: z.string().trim().min(1, 'Jenis wajib diisi'),
    waktu_mulai: z.string().min(1, 'Waktu mulai wajib diisi'),
    waktu_selesai: z.string().min(1, 'Waktu selesai wajib diisi'),
    deskripsi: z.string().optional(),
  })
  .refine((v) => new Date(v.waktu_selesai) > new Date(v.waktu_mulai), {
    message: 'Waktu selesai harus setelah waktu mulai',
    path: ['waktu_selesai'],
  });

type FormValues = z.infer<typeof schema>;

// Jenis event bebas teks di backend â€” beberapa contoh umum sbg saran cepat.
const JENIS_SUGGESTIONS = ['Ibadah Raya', 'Doa Bersama', 'Retreat', 'Pelatihan', 'Bakti Sosial', 'Perayaan'];

interface EventFormProps {
  mode: 'create' | 'edit';
  event?: EventDetail;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function EventForm({ mode, event, onSuccess, onCancel }: EventFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    handleSubmit,
    register,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      judul: event?.judul ?? '',
      jenis: event?.jenis ?? '',
      waktu_mulai: toDatetimeLocal(event?.waktu_mulai),
      waktu_selesai: toDatetimeLocal(event?.waktu_selesai),
      deskripsi: event?.deskripsi ?? '',
    },
  });

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    try {
      const payload = {
        judul: values.judul.trim(),
        jenis: values.jenis.trim(),
        waktu_mulai: new Date(values.waktu_mulai).toISOString(),
        waktu_selesai: new Date(values.waktu_selesai).toISOString(),
        deskripsi: values.deskripsi || undefined,
      };
      if (mode === 'create') {
        await createEvent(payload);
        toast.success('Event berhasil dibuat sebagai Draft');
      } else {
        await updateEvent(event!.id, payload);
        toast.success('Event berhasil diupdate');
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
          <Label htmlFor="judul">Judul Event *</Label>
          <Input id="judul" {...register('judul')} className="mt-1" />
          {errors.judul && <p className="mt-1 text-xs text-destructive">{errors.judul.message}</p>}
        </div>

        <div>
          <Label htmlFor="jenis">Jenis Event *</Label>
          <Input id="jenis" list="jenis-event-suggestions" {...register('jenis')} className="mt-1" />
          <datalist id="jenis-event-suggestions">
            {JENIS_SUGGESTIONS.map((j) => (
              <option key={j} value={j} />
            ))}
          </datalist>
          {errors.jenis && <p className="mt-1 text-xs text-destructive">{errors.jenis.message}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="waktu_mulai">Waktu Mulai *</Label>
            <Input id="waktu_mulai" type="datetime-local" {...register('waktu_mulai')} className="mt-1" />
            {errors.waktu_mulai && <p className="mt-1 text-xs text-destructive">{errors.waktu_mulai.message}</p>}
          </div>
          <div>
            <Label htmlFor="waktu_selesai">Waktu Selesai *</Label>
            <Input id="waktu_selesai" type="datetime-local" {...register('waktu_selesai')} className="mt-1" />
            {errors.waktu_selesai && (
              <p className="mt-1 text-xs text-destructive">{errors.waktu_selesai.message}</p>
            )}
          </div>
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

        {mode === 'create' && (
          <p className="rounded-md bg-modul-event/5 px-3 py-2 text-xs text-slate-500">
            Event baru akan dibuat dengan status <span className="font-medium">Draft</span>.
          </p>
        )}
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