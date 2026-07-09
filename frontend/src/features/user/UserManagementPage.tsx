import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { toast } from '@/lib/toast';
import { KeyRound, Plus, UserCog } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import PulsingDot from '@/components/PulsingDot';
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
            <Skeleton key={i} className="h-14 rounded-card" />
          ))}
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-slate-300 py-16 text-center">
          <UserCog className="h-10 w-10 text-slate-300" />
          <p className="font-medium text-slate-600">Belum ada user lain</p>
          <p className="max-w-sm text-xs text-slate-400">Tambahkan akun LEADER atau ADMIN baru untuk mulai mengelola akses.</p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Tambah User
          </Button>
        </div>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <>
          {/* Desktop/tablet */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status Aktif</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((u) => (
                  <TableRow key={u.id} className={!u.aktif ? 'opacity-60' : undefined}>
                    <TableCell className="font-medium text-slate-800">{u.username}</TableCell>
                    <TableCell>
                      {/* Role read-only: badge saja — tidak ada endpoint update peran. */}
                      <Badge variant="secondary">{u.peran}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <StatusToggleSwitch
                          checked={u.aktif}
                          label={`Ubah status akun ${u.username}`}
                          onClick={() => setToggleTarget(u)}
                        />
                        <Badge variant={u.aktif ? 'default' : 'secondary'}>
                          {u.aktif && <PulsingDot colorClass="bg-status-aktif" />}
                          {u.aktif ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-600">{formatLastLogin(u.last_login_at)}</TableCell>
                    <TableCell className="text-right">
                      {/* Sembunyi total utk baris LEADER — backend selalu 403. */}
                      {u.peran === 'ADMIN' && (
                        <Button variant="outline" size="sm" onClick={() => setResetTarget(u)}>
                          <KeyRound className="h-3.5 w-3.5" />
                          Reset Password
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: card-list */}
          <div className="space-y-3 sm:hidden">
            {items.map((u) => (
              <div
                key={u.id}
                className={cn("rounded-card border border-slate-200 bg-card p-4 transition-opacity", !u.aktif && "opacity-60")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">{u.username}</p>
                    <Badge variant="secondary" className="mt-1">{u.peran}</Badge>
                  </div>
                  <Badge variant={u.aktif ? 'default' : 'secondary'} className="shrink-0 gap-1.5">
                    {u.aktif && <PulsingDot colorClass="bg-status-aktif" />}
                    {u.aktif ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-slate-500">Login terakhir: {formatLastLogin(u.last_login_at)}</p>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-2">
                    <StatusToggleSwitch
                      checked={u.aktif}
                      label={`Ubah status akun ${u.username}`}
                      onClick={() => setToggleTarget(u)}
                    />
                    <span className="text-xs text-slate-500">Status</span>
                  </div>
                  {u.peran === 'ADMIN' && (
                    <Button variant="outline" size="sm" onClick={() => setResetTarget(u)}>
                      <KeyRound className="h-3.5 w-3.5" />
                      Reset Password
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
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