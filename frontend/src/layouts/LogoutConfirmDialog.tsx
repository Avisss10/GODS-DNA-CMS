import { Loader2, LogOut } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/lib/toast';
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
        <DialogHeader className="items-center text-center sm:text-center">
          <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <LogOut className="h-6 w-6" />
          </span>
          <DialogTitle>Keluar dari akun?</DialogTitle>
          <DialogDescription>Anda perlu login kembali untuk mengakses sistem.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoggingOut}
            className="transition-colors duration-150 active:scale-100"
          >
            Batal
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoggingOut}
            className="transition-colors duration-150 active:scale-100"
          >
            {isLoggingOut && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ya, Keluar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
