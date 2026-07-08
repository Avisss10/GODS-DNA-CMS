import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { isAxiosError } from 'axios';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CreateJemaatInput, JemaatDuplicateCandidates, JemaatFull } from '@/types/jemaat.types';
import { createJemaat, updateJemaat } from '../jemaat.api';
import DuplicateCandidatesDialog from './DuplicateCandidatesDialog';

// Styling disamakan dengan Input/Button shadcn bawaan, dipakai untuk
// elemen native (select, textarea) yang belum ada primitive shadcn-nya.
const fieldClass =
  'flex min-h-9 w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

const jemaatFormSchema = z.object({
  nama: z.string().trim().min(1, 'Nama wajib diisi'),
  tgl_lahir: z.string().min(1, 'Tanggal lahir wajib diisi'),
  jenis_kelamin: z.string().min(1, 'Jenis kelamin wajib dipilih'),
  tgl_bergabung: z.string().optional(),
  no_hp: z.string().optional(),
  alamat: z.string().optional(),
  instagram: z.string().optional(),
  facebook: z.string().optional(),
  whatsapp: z.string().optional(),
});

type JemaatFormValues = z.infer<typeof jemaatFormSchema>;

interface JemaatFormProps {
  mode: 'create' | 'edit';
  jemaat?: JemaatFull;
  onSuccess: () => void;
  onCancel: () => void;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function JemaatForm({ mode, jemaat, onSuccess, onCancel }: JemaatFormProps) {
  const [duplicateInfo, setDuplicateInfo] = useState<{
    duplicates: JemaatDuplicateCandidates;
    payload: CreateJemaatInput;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<JemaatFormValues>({
    resolver: zodResolver(jemaatFormSchema),
    defaultValues: {
      nama: jemaat?.nama ?? '',
      tgl_lahir: jemaat?.tgl_lahir ?? '',
      jenis_kelamin: jemaat?.jenis_kelamin ?? '',
      tgl_bergabung: jemaat?.tgl_bergabung ?? (mode === 'create' ? todayISO() : ''),
      no_hp: jemaat?.no_hp ?? '',
      alamat: jemaat?.alamat ?? '',
      instagram: jemaat?.media_sosial?.instagram ?? '',
      facebook: jemaat?.media_sosial?.facebook ?? '',
      whatsapp: jemaat?.media_sosial?.whatsapp ?? '',
    },
  });

  function buildPayload(values: JemaatFormValues): CreateJemaatInput {
    const media_sosial: Record<string, string> = {};
    if (values.instagram) media_sosial.instagram = values.instagram;
    if (values.facebook) media_sosial.facebook = values.facebook;
    if (values.whatsapp) media_sosial.whatsapp = values.whatsapp;

    return {
      nama: values.nama.trim(),
      tgl_lahir: values.tgl_lahir,
      jenis_kelamin: values.jenis_kelamin,
      tgl_bergabung: values.tgl_bergabung || undefined,
      no_hp: values.no_hp || undefined,
      alamat: values.alamat || undefined,
      media_sosial,
    };
  }

  async function onSubmit(values: JemaatFormValues) {
    const payload = buildPayload(values);
    setIsSubmitting(true);
    try {
      if (mode === 'create') {
        await createJemaat(payload);
        toast.success('Jemaat berhasil ditambahkan');
        onSuccess();
        return;
      }

      await updateJemaat(jemaat!.id, payload);
      toast.success('Data jemaat berhasil diperbarui');
      onSuccess();
    } catch (err) {
      if (
        mode === 'create' &&
        isAxiosError<{ duplicates?: JemaatDuplicateCandidates }>(err) &&
        err.response?.status === 409 &&
        err.response.data?.duplicates
      ) {
        setDuplicateInfo({ duplicates: err.response.data.duplicates, payload });
        return; // form tetap terbuka, data tidak hilang
      }
      // Error 500 (atau lainnya): tetap di form, data tidak hilang karena
      // reset() tidak dipanggil.
      toast.error('Terjadi kesalahan pada server, silakan coba lagi');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmSaveAnyway() {
    if (!duplicateInfo) return;
    setIsSubmitting(true);
    try {
      await createJemaat(duplicateInfo.payload, true);
      toast.success('Jemaat berhasil ditambahkan');
      setDuplicateInfo(null);
      onSuccess();
    } catch {
      toast.error('Terjadi kesalahan pada server, silakan coba lagi');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <fieldset disabled={isSubmitting} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="nama">Nama *</Label>
              <Input id="nama" {...register('nama')} className="mt-1" />
              {errors.nama && <p className="mt-1 text-xs text-destructive">{errors.nama.message}</p>}
            </div>

            <div>
              <Label htmlFor="tgl_lahir">Tanggal Lahir *</Label>
              <Input id="tgl_lahir" type="date" {...register('tgl_lahir')} className="mt-1" />
              {errors.tgl_lahir && <p className="mt-1 text-xs text-destructive">{errors.tgl_lahir.message}</p>}
            </div>

            <div>
              <Label htmlFor="jenis_kelamin">Jenis Kelamin *</Label>
              <select id="jenis_kelamin" {...register('jenis_kelamin')} className={`${fieldClass} mt-1`}>
                <option value="">Pilih...</option>
                <option value="L">Laki-laki</option>
                <option value="P">Perempuan</option>
              </select>
              {errors.jenis_kelamin && (
                <p className="mt-1 text-xs text-destructive">{errors.jenis_kelamin.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="tgl_bergabung">Tanggal Bergabung</Label>
              <Input id="tgl_bergabung" type="date" {...register('tgl_bergabung')} className="mt-1" />
            </div>

            <div>
              <Label htmlFor="no_hp">No. HP</Label>
              <Input id="no_hp" {...register('no_hp')} className="mt-1" placeholder="08xxxxxxxxxx" />
            </div>
          </div>

          <div>
            <Label htmlFor="alamat">Alamat</Label>
            <textarea id="alamat" rows={3} {...register('alamat')} className={`${fieldClass} mt-1`} />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Media Sosial</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="instagram" className="text-xs font-normal text-slate-500">
                  Instagram
                </Label>
                <Input id="instagram" {...register('instagram')} className="mt-1" placeholder="@username" />
              </div>
              <div>
                <Label htmlFor="facebook" className="text-xs font-normal text-slate-500">
                  Facebook
                </Label>
                <Input id="facebook" {...register('facebook')} className="mt-1" placeholder="nama profil" />
              </div>
              <div>
                <Label htmlFor="whatsapp" className="text-xs font-normal text-slate-500">
                  WhatsApp
                </Label>
                <Input id="whatsapp" {...register('whatsapp')} className="mt-1" placeholder="08xxxxxxxxxx" />
              </div>
            </div>
          </div>

          {mode === 'edit' && jemaat && (
            <div className="rounded-card bg-slate-50 p-3 text-sm">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                Dikelola otomatis oleh sistem
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-pill bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {jemaat.is_new_member ? 'Jemaat Baru' : 'Bukan Jemaat Baru'}
                </span>
                {jemaat.new_member_until && (
                  <span className="rounded-pill bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
                    Status baru s/d {new Date(jemaat.new_member_until).toLocaleDateString('id-ID')}
                  </span>
                )}
                <span className="rounded-pill bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {jemaat.is_non_cg ? 'Belum Ikut Cell Group' : 'Sudah Ikut Cell Group'}
                </span>
              </div>
            </div>
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

      {duplicateInfo && (
        <DuplicateCandidatesDialog
          open
          duplicates={duplicateInfo.duplicates}
          inputNama={duplicateInfo.payload.nama}
          inputTglLahir={duplicateInfo.payload.tgl_lahir}
          isSaving={isSubmitting}
          onCancel={() => setDuplicateInfo(null)}
          onConfirm={handleConfirmSaveAnyway}
        />
      )}
    </>
  );
}