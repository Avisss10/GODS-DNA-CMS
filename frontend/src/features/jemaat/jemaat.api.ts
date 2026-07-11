import { api } from '@/api/client';
import type {
  CreateJemaatInput,
  JemaatCgAttendance,
  JemaatEventHistory,
  JemaatFull,
  JemaatListItem,
  JemaatVolunteerAssignment,
  StatusKeaktifan,
  UpdateJemaatInput,
} from '@/types/jemaat.types';

// Re-export supaya import lama (mis. dashboard.utils.ts, StatusChart.tsx)
// yang mengambil StatusKeaktifan/JemaatListItem dari file ini tetap jalan.
export type {
  StatusKeaktifan,
  JemaatListItem,
  JemaatFull,
  CreateJemaatInput,
  UpdateJemaatInput,
};

interface ListJemaatParams {
  search?: string;
  limit?: number;
  offset?: number;
}

// Tidak ada total count dari backend (slice di memori) — untuk kebutuhan
// pagination UI, panggil dengan limit besar sekali lalu paginate + filter
// status di client (sudah disetujui di prompt).
export async function listJemaat(params: ListJemaatParams = {}): Promise<JemaatListItem[]> {
  const { data } = await api.get<JemaatListItem[]>('/jemaat', { params });
  return data;
}

// GET /jemaat/:id — no_hp/alamat/media_sosial di sini MASIH CIPHERTEXT.
// JANGAN render field-field ini dari hasil endpoint ini di UI mana pun.
export async function getJemaatById(id: number) {
  const { data } = await api.get(`/jemaat/${id}`);
  return data;
}

// GET /jemaat/:id/full — memicu 1 audit log VIEW_SENSITIVE (field: ALL).
// Panggil lewat useQuery dengan staleTime yang wajar, jangan di-refetch
// tanpa perlu.
export async function getJemaatFull(id: number): Promise<JemaatFull> {
  const { data } = await api.get<JemaatFull>(`/jemaat/${id}/full`);
  return data;
}

export interface CreateJemaatResult {
  id: number;
}

// Kalau backend balas 409 (kandidat duplikat), axios akan throw —
// tangani di caller dengan try/catch + isAxiosError, cek
// err.response.data.duplicates (bentuk: JemaatDuplicateCandidates).
export async function createJemaat(
  input: CreateJemaatInput,
  confirmed = false,
): Promise<CreateJemaatResult> {
  const { data } = await api.post<CreateJemaatResult>('/jemaat', {
    ...input,
    ...(confirmed ? { confirmed: true } : {}),
  });
  return data;
}

export async function updateJemaat(id: number, input: UpdateJemaatInput): Promise<JemaatFull> {
  const { data } = await api.put<JemaatFull>(`/jemaat/${id}`, input);
  return data;
}

// Soft delete. Kalau backend balas 409, err.response.data.detail berisi
// JemaatDependencies — tangani di caller.
export async function deleteJemaat(id: number): Promise<{ message: string }> {
  const { data } = await api.delete<{ message: string }>(`/jemaat/${id}`);
  return data;
}

interface EventHistoryParams {
  limit?: number;
  offset?: number;
}

export async function getJemaatEventHistory(
  id: number,
  params: EventHistoryParams = {},
): Promise<JemaatEventHistory[]> {
  const { data } = await api.get<JemaatEventHistory[]>(`/jemaat/${id}/events`, { params });
  return data;
}

// GET /jemaat/:id/cg-attendance-history — kehadiran meeting CG riil
// (cg_absensi.hadir = TRUE), dipakai Timeline Aktivitas agar selaras
// dengan sumber data skoring keaktifan (BEDA dari sekadar tanggal join
// keanggotaan CG).
export async function getJemaatCgAttendanceHistory(
  id: number,
  params: EventHistoryParams = {},
): Promise<JemaatCgAttendance[]> {
  const { data } = await api.get<JemaatCgAttendance[]>(`/cell-groups/members/${id}/absensi-history`, { params });
  return data;
}

// GET /jemaat/:id/volunteer-assignments — penugasan event_volunteer per
// event (BEDA dari registrasi jenis volunteer, lihat volunteer.api.ts
// listVolunteerByJemaat), semua status ditampilkan dengan badge berbeda.
export async function getJemaatVolunteerAssignments(
  id: number,
  params: EventHistoryParams = {},
): Promise<JemaatVolunteerAssignment[]> {
  const { data } = await api.get<JemaatVolunteerAssignment[]>(`/jemaat/${id}/volunteer-assignments`, { params });
  return data;
}

// SENGAJA TIDAK ADA fungsi untuk GET /jemaat/:id/sensitive/:field —
// endpoint per-field ini tidak dipakai frontend (lebih boros audit log
// dibanding /full).