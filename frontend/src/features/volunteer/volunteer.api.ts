import { api } from '@/api/client';

export interface VolunteerTypeListItem {
  id: number;
  nama: string;
  deskripsi: string | null;
  is_active: boolean;
  jumlah_anggota: number;
}

export async function listVolunteerTypes(): Promise<VolunteerTypeListItem[]> {
  const { data } = await api.get<VolunteerTypeListItem[]>('/volunteer-types');
  return data;
}