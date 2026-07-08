import type { StatusKeaktifan } from '@/types/jemaat.types';

export const STATUS_LABELS: Record<StatusKeaktifan, string> = {
  AKTIF: 'Aktif',
  KURANG_AKTIF: 'Kurang Aktif',
  TIDAK_AKTIF: 'Tidak Aktif',
  BELUM_CUKUP_DATA: 'Belum Cukup Data',
};

// Harus persis token status di tailwind.config.js -> colors.status
export const STATUS_COLORS: Record<StatusKeaktifan, string> = {
  AKTIF: '#16A34A',
  KURANG_AKTIF: '#D97706',
  TIDAK_AKTIF: '#DC2626',
  BELUM_CUKUP_DATA: '#64748B',
};

export const STATUS_BADGE_CLASSES: Record<StatusKeaktifan, string> = {
  AKTIF: 'bg-status-aktif/15 text-status-aktifText',
  KURANG_AKTIF: 'bg-status-kurangAktif/15 text-status-kurangAktifText',
  TIDAK_AKTIF: 'bg-status-tidakAktif/15 text-status-tidakAktifText',
  BELUM_CUKUP_DATA: 'bg-status-belumData/15 text-status-belumDataText',
};

export const STATUS_DOT_CLASSES: Record<StatusKeaktifan, string> = {
  AKTIF: 'bg-status-aktif',
  KURANG_AKTIF: 'bg-status-kurangAktif',
  TIDAK_AKTIF: 'bg-status-tidakAktif',
  BELUM_CUKUP_DATA: 'bg-status-belumData',
};

export const STATUS_FILTER_OPTIONS: { value: StatusKeaktifan | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Semua' },
  { value: 'AKTIF', label: 'Aktif' },
  { value: 'KURANG_AKTIF', label: 'Kurang Aktif' },
  { value: 'TIDAK_AKTIF', label: 'Tidak Aktif' },
  { value: 'BELUM_CUKUP_DATA', label: 'Belum Cukup Data' },
];