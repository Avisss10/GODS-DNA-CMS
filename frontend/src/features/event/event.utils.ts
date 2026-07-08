import type { EventStatus } from '@/types/event.types';
import { EVENT_STATUS_TRANSITIONS } from '@/types/event.types';

interface EventStatusVariant {
  label: string;
  className: string;
}

// Dipindah dari dashboard.utils.ts (dipakai UpcomingEventsWidget) —
// supaya satu sumber kebenaran warna badge status Event dipakai bersama
// oleh Dashboard, List, Kalender, dan Detail.
export function getEventStatusVariant(status: EventStatus): EventStatusVariant {
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

export function formatEventDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatEventDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Published',
  AKTIF: 'Aktif',
  SELESAI: 'Selesai',
  DIARSIPKAN: 'Diarsipkan',
};

// Daftar tombol transisi yang valid dari status saat ini — jangan pernah
// tampilkan semua status sebagai pilihan (sesuai instruksi prompt).
export function getValidNextStatuses(current: EventStatus): EventStatus[] {
  return EVENT_STATUS_TRANSITIONS[current] ?? [];
}

// Penjelasan konsekuensi singkat per transisi, ditampilkan di dialog
// konfirmasi wajib (semua transisi "tidak bisa mundur").
export function getTransitionConsequence(from: EventStatus, to: EventStatus): string {
  const key = `${from}->${to}`;
  const map: Record<string, string> = {
    'DRAFT->PUBLISHED':
      'Event akan dipublikasikan. Kebutuhan volunteer dan detail event masih bisa diedit selama status ini.',
    'PUBLISHED->AKTIF':
      'Absensi akan terbuka dan volunteer AKTIF otomatis tercatat hadir.',
    'PUBLISHED->DIARSIPKAN':
      'Event akan diarsipkan tanpa pernah berjalan (AKTIF). Event tidak bisa diedit atau dipublikasikan ulang setelah ini.',
    'AKTIF->SELESAI':
      'Absensi akan ditutup. Pastikan kehadiran final sudah diinput sebelum melanjutkan.',
    'SELESAI->DIARSIPKAN':
      'Event akan diarsipkan sebagai status akhir dan tidak bisa diubah lagi.',
  };
  return map[key] ?? `Status event akan berubah dari ${from} menjadi ${to}. Tindakan ini tidak bisa dibatalkan.`;
}