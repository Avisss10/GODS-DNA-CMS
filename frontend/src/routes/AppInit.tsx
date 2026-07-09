import { useEffect, useRef } from 'react';
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

  // Pemeriksaan sesi awal harus jalan TEPAT SEKALI, bukan dua kali seperti
  // yang dipicu StrictMode (mount -> cleanup -> mount ulang) di development —
  // dua panggilan /auth/me yang tumpang tindih membuat status sempat
  // bolak-balik 'loading' setelah request pertama selesai, membuka celah
  // singkat bagi ProtectedRoute untuk sempat merender sebelum status regenerasi.
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    setLoading();
    getMe()
      .then((user) => setUser(user))
      .catch(() => clearUser());
  }, [setLoading, setUser, clearUser]);

  if (status === 'idle' || status === 'loading') {
    return <FullScreenSplash />;
  }

  return <RouterProvider router={router} />;
}
