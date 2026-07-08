import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useSessionHeartbeat } from '@/features/auth/useSessionHeartbeat';
import CommandPalette from '@/components/CommandPalette';
import LogoutConfirmDialog from '@/layouts/LogoutConfirmDialog';
import Sidebar from '@/layouts/Sidebar';
import Topbar from '@/layouts/Topbar';

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);

  useSessionHeartbeat();

  return (
    <div className="flex min-h-screen bg-surface print:block print:bg-white">
      <Sidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onRequestLogout={() => setLogoutDialogOpen(true)}
      />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col print:block">
        <Topbar onOpenMobileMenu={() => setMobileOpen(true)} onRequestLogout={() => setLogoutDialogOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 print:p-0">
          <Outlet />
        </main>
      </div>
      <LogoutConfirmDialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen} />
      <CommandPalette />
    </div>
  );
}