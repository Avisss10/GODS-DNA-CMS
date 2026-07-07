import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { listCellGroups } from './cellgroup.api';
import CellGroupFormModal from './components/CellGroupFormModal';

export default function CellGroupListPage() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cellgroup', 'list'],
    queryFn: () => listCellGroups({ limit: 200 }),
  });

  function handleCreated() {
    queryClient.invalidateQueries({ queryKey: ['cellgroup', 'list'] });
  }

  const isEmpty = !isLoading && !isError && (data?.length ?? 0) === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Cell Group</h1>
          <p className="text-sm text-slate-500">Kelola Cell Group dan aktivitasnya</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" />
          Tambah Cell Group
        </Button>
      </div>

      {isError && (
        <p className="rounded-card border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Gagal memuat data Cell Group. Silakan muat ulang halaman.
        </p>
      )}

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-card bg-slate-100" />
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-slate-300 py-16 text-center">
          <UsersRound className="h-10 w-10 text-slate-300" />
          <p className="font-medium text-slate-600">Belum ada Cell Group</p>
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" />
            Tambah Cell Group
          </Button>
        </div>
      )}

      {!isLoading && !isEmpty && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data!.map((cg) => (
            <Link
              key={cg.id}
              to={`/cellgroup/${cg.id}`}
              className="block rounded-card border border-slate-200 p-4 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-slate-800">{cg.nama}</h3>
                <Badge variant={cg.is_active ? 'default' : 'secondary'}>
                  {cg.is_active ? 'Aktif' : 'Nonaktif'}
                </Badge>
              </div>
              {cg.deskripsi && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{cg.deskripsi}</p>}
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
                <span className="text-slate-500">
                  Leader: <span className="font-medium text-slate-700">{cg.nama_leader ?? '-'}</span>
                </span>
                <span className="flex items-center gap-1 text-slate-500">
                  <UsersRound className="h-3.5 w-3.5" /> {cg.jumlah_anggota}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <CellGroupFormModal open={formOpen} onOpenChange={setFormOpen} mode="create" onSuccess={handleCreated} />
    </div>
  );
}