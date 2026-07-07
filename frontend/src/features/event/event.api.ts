import { api } from '@/api/client';

export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'AKTIF' | 'SELESAI' | 'DIARSIPKAN';

export interface EventListItem {
  id: number;
  judul: string;
  jenis: string;
  waktu_mulai: string;
  waktu_selesai: string;
  deskripsi: string | null;
  status: EventStatus;
  absensi_status: 'OPEN' | 'CLOSED';
}

export async function listEvents(status?: EventStatus): Promise<EventListItem[]> {
  const { data } = await api.get<EventListItem[]>('/events', {
    params: status ? { status } : undefined,
  });
  return data;
}