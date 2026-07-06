import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { logout as logoutRequest } from '@/features/auth/auth.api';
import { useAuthStore } from '@/store/auth.store';

interface LogoutConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function LogoutConfirmDialog({ open, onOpenChange }: LogoutConfirmDialogProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const clearUser = useAuthStore((s) => s.clearUser);
  const navigate = useNavigate();

  async function handleConfirm() {
    setIsLoggingOut(true);
    try {
      await logoutRequest();
    } catch {
      // Tetap lanjutkan logout di sisi klien meski panggilan API gagal
    } finally {
      setIsLoggingOut(false);
      clearUser();
      onOpenChange(false);
      navigate('/login', { replace: true });
      toast.success('Anda telah keluar');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keluar dari akun?</DialogTitle>
          <DialogDescription>Anda perlu login kembali untuk mengakses sistem.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoggingOut}>
            Batal
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoggingOut}
            className="bg-gradient-to-r from-accent-from to-accent-to text-white"
          >
            {isLoggingOut && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ya, Keluar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
