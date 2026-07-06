import { FileQuestion } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-4 text-center">
      <FileQuestion className="h-16 w-16 text-slate-400" />
      <h1 className="text-3xl font-bold text-slate-800">404</h1>
      <p className="text-sm text-slate-600">Halaman yang Anda cari tidak ditemukan.</p>
      <Button asChild className="bg-gradient-to-r from-accent-from to-accent-to text-white">
        <Link to="/dashboard">Kembali ke Dashboard</Link>
      </Button>
    </div>
  );
}
