import { useState } from 'react';
import { BarChart3, CalendarDays, HandHeart, Users, UsersRound, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReportJenis } from '@/types/report.types';
import ReportFormModal from './components/ReportFormModal';
import Breadcrumb from '../../components/Breadcrumb';

interface ReportCardDef {
  jenis: ReportJenis;
  title: string;
  description: string;
  icon: LucideIcon;
  // Warna aksen kecil sesuai modul sumber data laporan tsb.
  accentClass: string;
}

const REPORT_CARDS: ReportCardDef[] = [
  { jenis: 'jemaat', title: 'Jemaat', description: 'Data seluruh jemaat', icon: Users, accentClass: 'bg-modul-jemaat' },
  { jenis: 'event', title: 'Event', description: 'Detail event & kehadiran', icon: CalendarDays, accentClass: 'bg-modul-event' },
  { jenis: 'cg', title: 'Cell Group', description: 'Aktivitas & anggota cell group', icon: UsersRound, accentClass: 'bg-modul-cellgroup' },
  { jenis: 'volunteer', title: 'Volunteer', description: 'Penugasan & histori volunteer', icon: HandHeart, accentClass: 'bg-modul-volunteer' },
  { jenis: 'analytics', title: 'Analytics', description: 'Ringkasan statistik bulanan', icon: BarChart3, accentClass: 'bg-modul-auditlog' },
];

export default function ReportPage() {
  const [activeJenis, setActiveJenis] = useState<ReportJenis | null>(null);

  return (
    <div className="space-y-4">
      <Breadcrumb segments={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Report' }]} />
      <div>
        <h1 className="text-xl font-bold text-slate-800">Report</h1>
        <p className="text-sm text-slate-500">Generate laporan data dalam format Excel atau PDF</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_CARDS.map((card) => (
          <button
            key={card.jenis}
            type="button"
            onClick={() => setActiveJenis(card.jenis)}
            className="group relative overflow-hidden rounded-xl border border-slate-200/70 bg-card p-4 text-left shadow-card transition-smooth hover:-translate-y-0.5 hover:shadow-card-hover"
          >
            <span className={cn('absolute inset-y-0 left-0 w-1', card.accentClass)} aria-hidden="true" />
            <div className="flex items-center gap-3 pl-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-modul-report/15">
                <card.icon className="h-5 w-5 text-modul-report" />
              </span>
              <div>
                <h3 className="font-semibold text-slate-800">{card.title}</h3>
                <p className="text-xs text-slate-500">{card.description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <ReportFormModal jenis={activeJenis} onOpenChange={(open) => !open && setActiveJenis(null)} />
    </div>
  );
}