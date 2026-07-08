import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { isAxiosError } from 'axios';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createUser } from '../user.api';

const schema = z.object({
  username: z.string().trim().min(4, 'Username minimal 4 karakter'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
  peran: z.enum(['LEADER', 'ADMIN']),
});
type FormValues = z.infer<typeof schema>;

interface CreateUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function CreateUserModal({ open, onOpenChange, onSuccess }: CreateUserModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '', peran: 'ADMIN' },
  });

  async function onSubmit(values: FormValues) {
    setIsSubmitting(true);
    try {
      await createUser(values);
      toast.success(`User "${values.username}" berhasil dibuat`);
      reset();
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      if (isAxiosError<{ message?: string }>(err) && err.response?.status === 409) {
        toast.error(err.response.data?.message ?? 'Username sudah terdaftar');
      } else {
        toast.error('Gagal membuat user, silakan coba lagi');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah User</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <fieldset disabled={isSubmitting} className="space-y-4">
            <div>
              <Label htmlFor="username">Username *</Label>
              <Input id="username" {...register('username')} className="mt-1" />
              {errors.username && <p className="mt-1 text-xs text-destructive">{errors.username.message}</p>}
            </div>
            <div>
              <Label htmlFor="password">Password *</Label>
              <Input id="password" type="text" {...register('password')} className="mt-1" />
              {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>}
            </div>
            <div>
              <Label htmlFor="peran">Peran *</Label>
              <select
                id="peran"
                {...register('peran')}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="ADMIN">ADMIN</option>
                <option value="LEADER">LEADER</option>
              </select>
            </div>
          </fieldset>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}