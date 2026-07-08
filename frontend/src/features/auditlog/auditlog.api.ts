import { api } from '@/api/client';

export type HmacStatus = 'OK' | 'POTENTIALLY_TAMPERED' | 'NO_SECRET';

export interface AuditLogItem {
  id: number;
  user_id: number | null;
  aksi: string;
  modul: string;
  object_id: number | null;
  data_sebelum: Record<string, unknown> | null;
  data_sesudah: Record<string, unknown> | null;
  created_at: string;
  hmac_valid: boolean;
  hmac_status: HmacStatus;
}

export interface AuditLogFilterParams {
  modul?: string;
  aksi?: string;
  userId?: string;
  objectId?: string;
  startDate?: string;
  endDate?: string;
}

// Buang key kosong/undefined supaya query string bersih —
// backend tidak menerima filter string kosong sebagai kondisi valid.
function cleanParams(params: AuditLogFilterParams) {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
}

export async function listAuditLogs(params: AuditLogFilterParams = {}): Promise<AuditLogItem[]> {
  const { data } = await api.get<AuditLogItem[]>('/audit-logs', { params: cleanParams(params) });
  return data;
}

export async function getAuditLogById(id: number): Promise<AuditLogItem> {
  const { data } = await api.get<AuditLogItem>(`/audit-logs/${id}`);
  return data;
}