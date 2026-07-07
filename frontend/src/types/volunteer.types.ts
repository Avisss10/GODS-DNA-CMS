import type { JemaatVolunteerHistory } from '@/types/jemaat.types';

// Re-export supaya file lama yang mengambil tipe ini dari volunteer.api.ts tetap jalan.
export type { JemaatVolunteerHistory };

export interface VolunteerTypeListItem {
  id: number;
  nama: string;
  deskripsi: string | null;
  is_active: boolean;
  jumlah_anggota: number;
}

export interface CreateVolunteerTypeInput {
  nama: string;
  deskripsi?: string;
}

// Body PUT parsial — semua field opsional.
export type UpdateVolunteerTypeInput = Partial<CreateVolunteerTypeInput>;