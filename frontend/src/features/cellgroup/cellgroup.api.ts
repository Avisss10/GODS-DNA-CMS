import { api } from '@/api/client';

export interface CellGroupListItem {
  id: number;
  nama: string;
  deskripsi: string | null;
  is_active: boolean;
  created_at: string;
  nama_leader: string | null;
  jumlah_anggota: number;
}

interface ListCellGroupParams {
  limit?: number;
  offset?: number;
}

export async function listCellGroups(params: ListCellGroupParams = {}): Promise<CellGroupListItem[]> {
  const { data } = await api.get<CellGroupListItem[]>('/cell-groups', { params });
  return data;
}