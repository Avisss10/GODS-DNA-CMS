import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/store/auth.store';
import type { Peran } from '@/types/auth.types';

interface ProtectedRouteProps {
  allowedRoles?: Peran[];
}

export default function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const status = useAuthStore((s) => s.status);
  const peran = useAuthStore((s) => s.peran);

  const isAuthenticated = status === 'authenticated';
  const forbidden = isAuthenticated && !!allowedRoles && !!peran && !allowedRoles.includes(peran);

  useEffect(() => {
    if (forbidden) {
      toast.error('Anda tidak memiliki akses ke halaman ini');
    }
  }, [forbidden]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (forbidden) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
