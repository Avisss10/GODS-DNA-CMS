import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useSessionHeartbeat } from '@/features/auth/useSessionHeartbeat';
import CommandPalette from '@/components/CommandPalette';
import RouteProgressBar from '@/components/RouteProgressBar';
import LogoutConfirmDialog from '@/layouts/LogoutConfirmDialog';
import Sidebar from '@/layouts/Sidebar';
import Topbar from '@/layouts/Topbar';

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const location = useLocation();

  useSessionHeartbeat();

  return (
    <div className="flex min-h-screen bg-surface print:block print:bg-white">
      <RouteProgressBar />

      <Sidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onRequestLogout={() => setLogoutDialogOpen(true)}
      />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col print:block">
        <Topbar onOpenMobileMenu={() => setMobileOpen(true)} onRequestLogout={() => setLogoutDialogOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 print:p-0">
          {/*
            key={pathname} memaksa React remount wrapper ini tiap ganti
            halaman, sehingga animasi fade-in dari tailwindcss-animate
            re-trigger setiap navigasi. Durasi 200ms — cukup halus,
            tidak mengganggu (sesuai aturan 5.H: jangan berlebihan/lambat).
          */}
          <div key={location.pathname} className="animate-in fade-in duration-200">
            <Outlet />
          </div>
        </main>
      </div>
      <LogoutConfirmDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen} />
      <CommandPalette />
    </div>
  );
}