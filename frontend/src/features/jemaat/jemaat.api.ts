import { api } from '@/api/client';

export type StatusKeaktifan = 'AKTIF' | 'KURANG_AKTIF' | 'TIDAK_AKTIF' | 'BELUM_CUKUP_DATA';

export interface JemaatListItem {
  id: number;
  nama: string;
  tgl_lahir: string | null;
  jenis_kelamin: string | null;
  tgl_bergabung: string | null;
  is_active: boolean;
  is_new_member: boolean;
  skor_keaktifan: number | null;
  status_keaktifan: StatusKeaktifan;
  created_at: string;
}

interface ListJemaatParams {
  search?: string;
  limit?: number;
  offset?: number;
}

// Catatan: endpoint ini tidak punya total count terpisah — backend memuat
// semua baris jemaat aktif ke memori lalu slice sesuai limit/offset.
// Untuk kebutuhan dashboard (agregasi status keaktifan), panggil dengan
// limit besar agar data yang didapat lengkap.
export async function listJemaat(params: ListJemaatParams = {}): Promise<JemaatListItem[]> {
  const { data } = await api.get<JemaatListItem[]>('/jemaat', { params });
  return data;
}