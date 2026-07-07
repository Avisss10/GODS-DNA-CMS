import { api } from '@/api/client';
import type {
  ActiveMemberAtMeeting,
  AbsensiEntry,
  CellGroupDetail,
  CellGroupListItem,
  CellGroupMember,
  CgMeetingDetail,
  CgMeetingListItem,
  CgMeetingPhoto,
  CreateCellGroupInput,
  CreateMeetingInput,
  UpdateCellGroupInput,
  UpdateMeetingInput,
} from '@/types/cellgroup.types';

interface ListParams {
  limit?: number;
  offset?: number;
}

// --- Cell Group ---

export async function listCellGroups(params: ListParams = {}): Promise<CellGroupListItem[]> {
  const { data } = await api.get<CellGroupListItem[]>('/cell-groups', { params });
  return data;
}

// Lihat catatan di cellgroup.types.ts: TIDAK ada nama_leader/jumlah_anggota di sini.
export async function getCellGroupById(id: number): Promise<CellGroupDetail> {
  const { data } = await api.get<CellGroupDetail>(`/cell-groups/${id}`);
  return data;
}

export async function createCellGroup(input: CreateCellGroupInput): Promise<{ id: number }> {
  const { data } = await api.post<{ id: number }>('/cell-groups', input);
  return data;
}

// Body PARSIAL, snake_case (leader_id) — jangan disatukan dgn createCellGroup.
export async function updateCellGroup(id: number, input: UpdateCellGroupInput): Promise<{ message: string }> {
  const { data } = await api.put<{ message: string }>(`/cell-groups/${id}`, input);
  return data;
}

// 409 kalau masih ada anggota aktif — caller tangani via isAxiosError.
export async function deactivateCellGroup(id: number): Promise<{ message: string }> {
  const { data } = await api.delete<{ message: string }>(`/cell-groups/${id}`);
  return data;
}

// 404 kalau CG tidak pernah ada, 409 kalau sudah aktif.
export async function activateCellGroup(id: number): Promise<{ message: string }> {
  const { data } = await api.patch<{ message: string }>(`/cell-groups/${id}/activate`);
  return data;
}

export async function getActiveMembers(cgId: number): Promise<CellGroupMember[]> {
  const { data } = await api.get<CellGroupMember[]>(`/cell-groups/${cgId}/members`);
  return data;
}

// 409 kalau jemaat sudah anggota aktif CG ini.
export async function addMember(cgId: number, jemaatId: number): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>(`/cell-groups/${cgId}/members`, { jemaatId });
  return data;
}

export async function removeMember(cgId: number, jemaatId: number): Promise<{ message: string }> {
  const { data } = await api.delete<{ message: string }>(`/cell-groups/${cgId}/members/${jemaatId}`);
  return data;
}

// --- Meeting ---

export async function listMeetings(cgId: number, params: ListParams = {}): Promise<CgMeetingListItem[]> {
  const { data } = await api.get<CgMeetingListItem[]>(`/cell-groups/${cgId}/meetings`, { params });
  return data;
}

// Body camelCase — dipakai HANYA untuk create.
export async function createMeeting(cgId: number, input: CreateMeetingInput): Promise<{ id: number }> {
  const { data } = await api.post<{ id: number }>(`/cell-groups/${cgId}/meetings`, input);
  return data;
}

export async function getMeetingById(meetingId: number): Promise<CgMeetingDetail> {
  const { data } = await api.get<CgMeetingDetail>(`/cell-groups/meetings/${meetingId}`);
  return data;
}

// Body snake_case, parsial — dipakai HANYA untuk update. Jangan digabung
// dengan createMeeting meski secara nilai sama.
export async function updateMeeting(meetingId: number, input: UpdateMeetingInput): Promise<{ message: string }> {
  const { data } = await api.put<{ message: string }>(`/cell-groups/meetings/${meetingId}`, input);
  return data;
}

// --- Foto meeting ---

export async function uploadMeetingPhoto(
  meetingId: number,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ id: number; sizeKb: number }> {
  const formData = new FormData();
  formData.append('photo', file);
  const { data } = await api.post<{ id: number; sizeKb: number }>(
    `/cell-groups/meetings/${meetingId}/photos`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (evt) => {
        if (onProgress && evt.total) {
          onProgress(Math.round((evt.loaded / evt.total) * 100));
        }
      },
    },
  );
  return data;
}

export async function listMeetingPhotos(meetingId: number): Promise<CgMeetingPhoto[]> {
  const { data } = await api.get<CgMeetingPhoto[]>(`/cell-groups/meetings/${meetingId}/photos`);
  return data;
}

// GET /cell-groups/photos/:photoId adalah streaming file, bukan JSON.
// Dipakai lewat blob (bukan <img src> langsung) supaya cookie auth ikut
// terkirim dengan pasti meski FE & BE beda origin — sesuai fallback yang
// disebutkan di prompt ("kalau CORS/cookie bermasalah, pakai fetch+blob").
export async function getPhotoBlobUrl(photoId: number): Promise<string> {
  const { data } = await api.get(`/cell-groups/photos/${photoId}`, { responseType: 'blob' });
  return URL.createObjectURL(data as Blob);
}

export async function deletePhoto(photoId: number): Promise<{ message: string }> {
  const { data } = await api.delete<{ message: string }>(`/cell-groups/photos/${photoId}`);
  return data;
}

// --- Absensi ---

export async function getActiveMembersAtMeetingTime(meetingId: number): Promise<ActiveMemberAtMeeting[]> {
  const { data } = await api.get<ActiveMemberAtMeeting[]>(`/cell-groups/meetings/${meetingId}/active-members`);
  return data;
}

export async function submitAbsensi(meetingId: number, absensi: AbsensiEntry[]): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>(`/cell-groups/meetings/${meetingId}/absensi`, { absensi });
  return data;
}