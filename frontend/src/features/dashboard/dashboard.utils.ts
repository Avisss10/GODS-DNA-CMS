import type { EventListItem } from '@/features/event/event.api';
import type { JemaatListItem, StatusKeaktifan } from '@/features/jemaat/jemaat.api';
export { STATUS_LABELS, STATUS_COLORS } from '@/features/jemaat/jemaat.constants';

export function countByStatusKeaktifan(list: JemaatListItem[]): Record<StatusKeaktifan, number> {
  const counts: Record<StatusKeaktifan, number> = {
    AKTIF: 0,
    KURANG_AKTIF: 0,
    TIDAK_AKTIF: 0,
    BELUM_CUKUP_DATA: 0,
  };
  for (const item of list) {
    if (item.status_keaktifan in counts) {
      counts[item.status_keaktifan] += 1;
    }
  }
  return counts;
}

function isUpcoming(event: EventListItem, now: number): boolean {
  return event.status !== 'DIARSIPKAN' && new Date(event.waktu_mulai).getTime() > now;
}

export function getUpcomingEvents(events: EventListItem[], limit = 5): EventListItem[] {
  const now = Date.now();
  return events
    .filter((e) => isUpcoming(e, now))
    .sort((a, b) => new Date(a.waktu_mulai).getTime() - new Date(b.waktu_mulai).getTime())
    .slice(0, limit);
}

export function countUpcomingEvents(events: EventListItem[]): number {
  const now = Date.now();
  return events.filter((e) => isUpcoming(e, now)).length;
}

export interface BirthdayEntry {
  id: number;
  nama: string;
  tglLahir: string;
  daysUntil: number;
}

// tgl_lahir dari backend berformat 'YYYY-MM-DD' (plaintext hasil dekripsi).
// Bulan+tanggal dibandingkan terhadap hari ini, tahun diabaikan.
export function getUpcomingBirthdays(list: JemaatListItem[], daysAhead = 7): BirthdayEntry[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const entries: BirthdayEntry[] = [];

  for (const item of list) {
    if (!item.tgl_lahir) continue;
    const parts = item.tgl_lahir.split('-');
    if (parts.length !== 3) continue;

    const month = Number(parts[1]) - 1;
    const day = Number(parts[2]);
    if (Number.isNaN(month) || Number.isNaN(day)) continue;

    let nextBirthday = new Date(today.getFullYear(), month, day);
    if (nextBirthday.getTime() < today.getTime()) {
      nextBirthday = new Date(today.getFullYear() + 1, month, day);
    }

    const daysUntil = Math.round((nextBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil <= daysAhead) {
      entries.push({ id: item.id, nama: item.nama, tglLahir: item.tgl_lahir, daysUntil });
    }
  }

  return entries.sort((a, b) => a.daysUntil - b.daysUntil);
}

export function formatEventDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function formatBirthdayDate(dateStr: string): string {
  const parts = dateStr.split('-');
  const monthIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  return `${day} ${SHORT_MONTHS[monthIdx] ?? ''}`.trim();
}

export function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return 'Baru saja';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam lalu`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} hari lalu`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 5) return `${diffWeek} minggu lalu`;
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface EventStatusVariant {
  label: string;
  className: string;
}

export function getEventStatusVariant(status: EventListItem['status']): EventStatusVariant {
  switch (status) {
    case 'DRAFT':
      return { label: 'Draft', className: 'border-transparent bg-slate-200 text-slate-700' };
    case 'PUBLISHED':
      return { label: 'Published', className: 'border-transparent bg-blue-100 text-blue-700' };
    case 'AKTIF':
      return { label: 'Aktif', className: 'border-transparent bg-status-aktif/15 text-status-aktif' };
    case 'SELESAI':
      return { label: 'Selesai', className: 'border-transparent bg-slate-200 text-slate-600' };
    case 'DIARSIPKAN':
      return { label: 'Diarsipkan', className: 'border-transparent bg-slate-300 text-slate-500' };
    default:
      return { label: status, className: 'border-transparent bg-slate-200 text-slate-700' };
  }
}