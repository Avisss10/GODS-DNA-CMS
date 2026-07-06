import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { getMe } from '@/features/auth/auth.api';
import { router } from '@/routes/index';
import { useAuthStore } from '@/store/auth.store';

function FullScreenSplash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}

export default function AppInit() {
  const status = useAuthStore((s) => s.status);
  const setUser = useAuthStore((s) => s.setUser);
  const clearUser = useAuthStore((s) => s.clearUser);
  const setLoading = useAuthStore((s) => s.setLoading);

  useEffect(() => {
    let active = true;
    setLoading();
    getMe()
      .then((user) => {
        if (active) setUser(user);
      })
      .catch(() => {
        if (active) clearUser();
      });
    return () => {
      active = false;
    };
  }, [setLoading, setUser, clearUser]);

  if (status === 'idle' || status === 'loading') {
    return <FullScreenSplash />;
  }

  return <RouterProvider router={router} />;
}
