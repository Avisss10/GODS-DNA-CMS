import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { KeyRound, Plus, UserCog } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { listUsers, updateUserStatus, type ManagedUser } from './user.api';
import CreateUserModal from './components/CreateUserModal';
import ResetPasswordModal from './components/ResetPasswordModal';
import StatusToggleSwitch from './components/StatusToggleSwitch';
import ToggleStatusDialog from './components/ToggleStatusDialog';

function formatLastLogin(value: string | null): string {
  if (!value) return 'Belum pernah login';
  return new Date(value).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function UserManagementPage() {
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);
  const [toggleTarget, setToggleTarget] = useState<ManagedUser | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['users', 'list'],
    queryFn: listUsers,
  });

  function invalidateList() {
    queryClient.invalidateQueries({ queryKey: ['users', 'list'] });
  }

  // Dialog konfirmasi selalu tampil dulu, SEBELUM ada perubahan visual apa
  // pun pada switch — jadi kalau backend menolak (400), switch otomatis
  // "kembali ke posisi semula" karena memang belum pernah dipindah.
  async function handleConfirmToggle() {
    if (!toggleTarget) return;
    setIsToggling(true);
    try {
      const res = await updateUserStatus(toggleTarget.id, !toggleTarget.aktif);
      toast.success(res.message);
      invalidateList();
      setToggleTarget(null);
    } catch (err) {
      if (isAxiosError<{ message?: string }>(err) && err.response?.data?.message) {
        toast.error(err.response.data.message);
      } else {
        toast.error('Gagal mengubah status akun');
      }
      setToggleTarget(null);
    } finally {
      setIsToggling(false);
    }
  }

  const items = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800">
            <UserCog className="h-5 w-5 text-slate-600" />
            User Management
          </h1>
          <p className="text-sm text-slate-500">Kelola akun LEADER dan ADMIN</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Tambah User
        </Button>
      </div>

      {isError && (
        <p className="rounded-card border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Gagal memuat daftar user. Silakan muat ulang halaman.
        </p>
      )}

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-card bg-slate-100" />
          ))}
        </div>
      )}

      {!isLoading && !isError && (
        <div className="overflow-x-auto rounded-card border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Username</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status Aktif</th>
                <th className="px-4 py-3 font-medium">Last Login</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((u) => (
                <tr key={u.id} className={!u.aktif ? 'opacity-60' : undefined}>
                  <td className="px-4 py-3 font-medium text-slate-800">{u.username}</td>
                  <td className="px-4 py-3">
                    {/* Role read-only: badge saja — tidak ada endpoint update peran. */}
                    <Badge variant="secondary">{u.peran}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StatusToggleSwitch checked={u.aktif} onClick={() => setToggleTarget(u)} />
                      <Badge variant={u.aktif ? 'default' : 'secondary'}>{u.aktif ? 'Aktif' : 'Nonaktif'}</Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatLastLogin(u.last_login_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {/* Sembunyi total utk baris LEADER — backend selalu 403. */}
                    {u.peran === 'ADMIN' && (
                      <Button variant="outline" size="sm" onClick={() => setResetTarget(u)}>
                        <KeyRound className="h-3.5 w-3.5" />
                        Reset Password
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateUserModal open={createOpen} onOpenChange={setCreateOpen} onSuccess={invalidateList} />

      <ResetPasswordModal
        target={resetTarget}
        onOpenChange={(open) => !open && setResetTarget(null)}
        onSuccess={invalidateList}
      />

      <ToggleStatusDialog
        target={toggleTarget}
        isSubmitting={isToggling}
        onOpenChange={(open) => !open && setToggleTarget(null)}
        onConfirm={handleConfirmToggle}
      />
    </div>
  );
}