import { useState } from 'react';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { Dices } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resetPassword, type ManagedUser } from '../user.api';
import { generateRandomPassword } from '../user.utils';

interface ResetPasswordModalProps {
  target: ManagedUser | null;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function ResetPasswordModal({ target, onOpenChange, onSuccess }: ResetPasswordModalProps) {
  const [newPassword, setNewPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose(open: boolean) {
    if (!open) {
      setNewPassword('');
      setError(null);
    }
    onOpenChange(open);
  }

  function handleGenerate() {
    setNewPassword(generateRandomPassword(12));
    setError(null);
  }

  async function handleSubmit() {
    if (!target) return;
    if (newPassword.length < 8) {
      setError('Password minimal 8 karakter');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await resetPassword(target.id, newPassword);
      toast.success(res.message);
      handleClose(false);
      onSuccess();
    } catch (err) {
      if (isAxiosError<{ message?: string }>(err) && err.response?.data?.message) {
        toast.error(err.response.data.message);
      } else {
        toast.error('Gagal mereset password');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
          <DialogDescription>
            Akun "{target?.username}" (ADMIN). Sesi aktif akun ini akan langsung diakhiri setelah reset.
          </DialogDescription>
        </DialogHeader>

        <div>
          <Label htmlFor="newPassword">Password Baru *</Label>
          <div className="mt-1 flex gap-2">
            <Input
              id="newPassword"
              type="text"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setError(null); }}
              placeholder="Ketik manual atau generate"
              disabled={isSubmitting}
            />
            <Button type="button" variant="outline" onClick={handleGenerate} disabled={isSubmitting}>
              <Dices className="h-4 w-4" />
              Generate
            </Button>
          </div>
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          <p className="mt-1 text-xs text-slate-500">
            Password ditampilkan jelas supaya bisa disalin/dicatat oleh Leader.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={isSubmitting}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Mereset...' : 'Reset Password'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}