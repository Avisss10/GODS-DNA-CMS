import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

/** Halaman percobaan tema — sementara, dihapus saat Tahap 1. */

const baseColors = [
  { label: 'sidebar', hex: '#CBD4DF', className: 'bg-sidebar' },
  { label: 'surface', hex: '#D9DFE7', className: 'bg-surface' },
  { label: 'card', hex: '#F1F4F8', className: 'bg-card' },
];

const modulColors = [
  { label: 'modul.jemaat', hex: '#2563EB', className: 'bg-modul-jemaat' },
  { label: 'modul.cellgroup', hex: '#0D9488', className: 'bg-modul-cellgroup' },
  { label: 'modul.event', hex: '#EA580C', className: 'bg-modul-event' },
  { label: 'modul.volunteer', hex: '#9333EA', className: 'bg-modul-volunteer' },
  { label: 'modul.report', hex: '#DB2777', className: 'bg-modul-report' },
  { label: 'modul.auditlog', hex: '#64748B', className: 'bg-modul-auditlog' },
];

const statusColors = [
  { label: 'status.aktif', hex: '#16A34A', className: 'bg-status-aktif' },
  { label: 'status.kurangAktif', hex: '#D97706', className: 'bg-status-kurangAktif' },
  { label: 'status.tidakAktif', hex: '#DC2626', className: 'bg-status-tidakAktif' },
  { label: 'status.belumData', hex: '#64748B', className: 'bg-status-belumData' },
];

function Swatch({ label, hex, className }: { label: string; hex: string; className: string }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <div className={`h-16 w-28 rounded-card border border-slate-300 ${className}`} />
      <span className="text-xs font-medium">{label}</span>
      <span className="text-xs text-slate-500">{hex}</span>
    </div>
  );
}

export default function ThemePreview() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-8">
      <header>
        <h1 className="text-2xl font-bold">GODS DNA CMS — Theme Preview</h1>
        <p className="text-sm text-slate-600">
          Tahap 0 · design token &quot;Slate Modern&quot; + komponen shadcn/ui
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Warna dasar</h2>
        <div className="flex flex-wrap gap-4">
          {baseColors.map((c) => (
            <Swatch key={c.label} {...c} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Warna modul</h2>
        <div className="flex flex-wrap gap-4">
          {modulColors.map((c) => (
            <Swatch key={c.label} {...c} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Warna status</h2>
        <div className="flex flex-wrap gap-4">
          {statusColors.map((c) => (
            <Swatch key={c.label} {...c} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Tombol gradient</h2>
        <Button className="bg-gradient-to-r from-accent-from to-accent-to text-white">
          Aksi Utama
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Komponen</h2>
        <Card className="rounded-card">
          <CardHeader>
            <CardTitle>Contoh Card</CardTitle>
            <CardDescription>Card dengan radius 8px di atas surface.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-pill bg-status-aktif text-white">Aktif</Badge>
              <Badge className="rounded-pill bg-status-kurangAktif text-white">Kurang Aktif</Badge>
              <Badge className="rounded-pill bg-status-tidakAktif text-white">Tidak Aktif</Badge>
              <Badge className="rounded-pill bg-status-belumData text-white">Belum Ada Data</Badge>
            </div>

            <div className="max-w-sm space-y-1.5">
              <Label htmlFor="contoh-input">Contoh Input</Label>
              <Input id="contoh-input" placeholder="Ketik sesuatu…" />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">Buka Dialog</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Contoh Dialog</DialogTitle>
                    <DialogDescription>
                      Dialog shadcn/ui — bisa ditutup lewat tombol, overlay, atau Esc.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button onClick={() => setDialogOpen(false)}>Tutup</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button
                variant="secondary"
                onClick={() => toast.success('Toast berhasil dipicu!')}
              >
                Tampilkan Toast
              </Button>
            </div>

            <div className="space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-16 w-full rounded-card" />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
