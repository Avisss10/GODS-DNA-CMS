import { api } from '@/api/client';
import type { JemaatVolunteerHistory } from '@/types/jemaat.types';
export type { JemaatVolunteerHistory };

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

// Dipakai timeline Jemaat (Tahap 3) & modul Volunteer penuh (Tahap 5).
export async function listVolunteerByJemaat(jemaatId: number): Promise<JemaatVolunteerHistory[]> {
  const { data } = await api.get<JemaatVolunteerHistory[]>(`/jemaat/${jemaatId}/volunteer`);
  return data;
}