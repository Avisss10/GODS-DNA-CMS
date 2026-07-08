import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Print-friendly export TAMPILAN LAYAR (fitur tambahan, terpisah dari
// modul Report resmi) — hanya mem-print tabel/data yang sedang terlihat
// di layar saat ini via CSS @media print (lihat print:hidden di
// Sidebar/Topbar/kontrol halaman), BUKAN generate ulang dari server.
export default function PrintButton() {
  return (
    <Button type="button" variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      Cetak/Export Tampilan
    </Button>
  );
}