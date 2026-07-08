// Backend TIDAK punya kolom severity — diturunkan dari `jenis` di sisi
// frontend sesuai mapping yang disepakati (lihat prompt Tahap 8).
export type NotificationSeverity = 'kritis' | 'peringatan' | 'info';

const KRITIS_JENIS = new Set(['AUDIT_TAMPERED', 'LEADER_TINGGAL_SATU']);
const PERINGATAN_JENIS = new Set(['LOGIN_GAGAL_BERULANG', 'LOGIN_IP_BARU', 'EKSPOR_DATA_MALAM']);

// SCORING_SELESAI, EVENT_SELESAI, dan jenis lain yang tidak dikenal
// semuanya jatuh ke default 'info'.
export function getNotificationSeverity(jenis: string): NotificationSeverity {
  if (KRITIS_JENIS.has(jenis)) return 'kritis';
  if (PERINGATAN_JENIS.has(jenis)) return 'peringatan';
  return 'info';
}

export const SEVERITY_LABELS: Record<NotificationSeverity, string> = {
  kritis: 'Kritis',
  peringatan: 'Peringatan',
  info: 'Info',
};