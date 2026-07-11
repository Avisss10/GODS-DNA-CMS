import { api } from '@/api/client';
import type {
  CreateVolunteerTypeInput,
  JemaatVolunteerHistory,
  UpdateVolunteerTypeInput,
  VolunteerTypeListItem,
} from '@/types/volunteer.types';
import type { VolunteerTypeMember } from '@/types/event.types';

// Re-export supaya import lama (mis. JemaatDetailPage) yang mengambil tipe
// dari file ini tetap jalan tanpa perlu diubah.
export type {
  VolunteerTypeListItem,
  CreateVolunteerTypeInput,
  UpdateVolunteerTypeInput,
  JemaatVolunteerHistory,
};

// --- Master Jenis Volunteer ---

// GET /volunteer-types mengembalikan aktif + nonaktif sekaligus (is_active disertakan).
export async function listVolunteerTypes(): Promise<VolunteerTypeListItem[]> {
  const { data } = await api.get<VolunteerTypeListItem[]>('/volunteer-types');
  return data;
}

// requireRole('ADMIN','LEADER') di backend. 409 kalau nama duplikat —
// tangani via isAxiosError di caller, pakai pesan asli dari backend.
export async function createVolunteerType(
  input: CreateVolunteerTypeInput,
): Promise<{ id: number }> {
  const { data } = await api.post<{ id: number }>('/volunteer-types', input);
  return data;
}

// Body PARSIAL: { nama?, deskripsi? }.
export async function updateVolunteerType(
  id: number,
  input: UpdateVolunteerTypeInput,
): Promise<{ message: string }> {
  const { data } = await api.put<{ message: string }>(`/volunteer-types/${id}`, input);
  return data;
}

// Soft delete (nonaktifkan). Sukses -> { message: 'Jenis volunteer berhasil dinonaktifkan' }.
export async function deactivateVolunteerType(id: number): Promise<{ message: string }> {
  const { data } = await api.delete<{ message: string }>(`/volunteer-types/${id}`);
  return data;
}

// Reaktivasi. 404 kalau tidak ada, 409 kalau sudah aktif —
// tangani di caller lewat isAxiosError kalau perlu.
// Sukses -> { message: 'Jenis volunteer berhasil diaktifkan kembali' }.
export async function activateVolunteerType(id: number): Promise<{ message: string }> {
  const { data } = await api.patch<{ message: string }>(`/volunteer-types/${id}/activate`);
  return data;
}

// Anggota aktif sebuah jenis volunteer — dipakai halaman detail jenis
// volunteer. Endpoint sama dengan yang dipakai modul Event untuk
// pencarian manual saat "Tugaskan" (lihat event.api.ts).
export async function getVolunteerTypeMembers(volunteerTypeId: number): Promise<VolunteerTypeMember[]> {
  const { data } = await api.get<VolunteerTypeMember[]>(`/volunteer-types/${volunteerTypeId}/members`);
  return data;
}

// --- Registrasi Jemaat ke Volunteer ---

// Dipakai timeline & profil Jemaat (Tahap 3 & 5) & modul Volunteer penuh (Tahap 5).
export async function listVolunteerByJemaat(jemaatId: number): Promise<JemaatVolunteerHistory[]> {
  const { data } = await api.get<JemaatVolunteerHistory[]>(`/jemaat/${jemaatId}/volunteer`);
  return data;
}

// 409 kalau jemaat sudah terdaftar utk jenis ini, 400 kalau jemaat nonaktif.
// Tangani via isAxiosError di caller.
export async function registerVolunteer(
  jemaatId: number,
  volunteerTypeId: number,
): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>(`/jemaat/${jemaatId}/volunteer`, {
    volunteerTypeId,
  });
  return data;
}

export async function unregisterVolunteer(
  jemaatId: number,
  volunteerTypeId: number,
): Promise<{ message: string }> {
  const { data } = await api.delete<{ message: string }>(
    `/jemaat/${jemaatId}/volunteer/${volunteerTypeId}`,
  );
  return data;
}