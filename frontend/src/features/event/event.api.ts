import { api } from '@/api/client';
import { isAxiosError } from 'axios';
import type {
  EventListItem,
  EventDetail,
  CreateEventInput,
  UpdateEventInput,
  EventStatus,
  EventKehadiran,
  InputKehadiranInput,
  VolunteerNeed,
  UpdateVolunteerNeedsInput,
  EventVolunteer,
  AssignVolunteerInput,
  ReplaceVolunteerInput,
  ReplaceVolunteerResult,
  SuggestedVolunteer,
  VolunteerTypeMember,
} from '@/types/event.types';

// Re-export supaya import lama (mis. dashboard.utils, widget) tetap jalan.
export type { EventListItem, EventDetail, EventStatus } from '@/types/event.types';

// --- Event ---

// Tanpa param status = semua event (dipakai list page utk filter client-side).
export async function listEvents(status?: EventStatus): Promise<EventListItem[]> {
  const { data } = await api.get<EventListItem[]>('/events', {
    params: status ? { status } : undefined,
  });
  return data;
}

export async function getEventById(id: number): Promise<EventDetail> {
  const { data } = await api.get<EventDetail>(`/events/${id}`);
  return data;
}

// Status otomatis DRAFT di backend.
export async function createEvent(input: CreateEventInput): Promise<EventDetail> {
  const { data } = await api.post<EventDetail>('/events', input);
  return data;
}

// Backend hanya izinkan saat status DRAFT/PUBLISHED (400 di status lain) —
// FE tetap nonaktifkan tombol Edit di luar 2 status itu, jangan andalkan
// error backend saja (sesuai instruksi prompt).
export async function updateEvent(id: number, input: UpdateEventInput): Promise<EventDetail> {
  const { data } = await api.put<EventDetail>(`/events/${id}`, input);
  return data;
}

// Tidak ada endpoint hapus event — sengaja tidak dibuat deleteEvent().
export async function updateEventStatus(id: number, status: EventStatus): Promise<EventDetail> {
  const { data } = await api.patch<EventDetail>(`/events/${id}/status`, { status });
  return data;
}

// --- Kehadiran ---

// 404 dari backend berarti "belum diinput" — bukan error, jadi ditangkap
// di sini dan dikembalikan null. Caller tinggal cek null utk tampilkan
// form kosong vs ringkasan read-only.
export async function getKehadiran(eventId: number): Promise<EventKehadiran | null> {
  try {
    const { data } = await api.get<EventKehadiran>(`/events/${eventId}/kehadiran`);
    return data;
  } catch (err) {
    if (isAxiosError(err) && err.response?.status === 404) return null;
    throw err;
  }
}

// POST ini sebenarnya upsert (ON DUPLICATE KEY UPDATE di backend) —
// dipakai baik utk input pertama kali maupun "Ubah".
export async function submitKehadiran(
  eventId: number,
  input: InputKehadiranInput,
): Promise<EventKehadiran> {
  const { data } = await api.post<EventKehadiran>(`/events/${eventId}/kehadiran`, input);
  return data;
}

// --- Kebutuhan Volunteer (kuota) ---

// Array kosong = belum diset kuota (berarti tanpa batas).
export async function getVolunteerNeeds(eventId: number): Promise<VolunteerNeed[]> {
  const { data } = await api.get<VolunteerNeed[]>(`/events/${eventId}/volunteer-needs`);
  return data;
}

// Kirim SELURUH daftar yang diinginkan — baris yg tidak disertakan akan
// dihapus (409 kalau masih ada penugasan aktif di jenis itu).
export async function updateVolunteerNeeds(
  eventId: number,
  input: UpdateVolunteerNeedsInput,
): Promise<VolunteerNeed[]> {
  const { data } = await api.put<VolunteerNeed[]>(`/events/${eventId}/volunteer-needs`, input);
  return data;
}

// --- Assignment Volunteer ---

export async function listEventVolunteers(eventId: number): Promise<EventVolunteer[]> {
  const { data } = await api.get<EventVolunteer[]>(`/events/${eventId}/volunteers`);
  return data;
}

// 409 kalau kuota jenis itu sudah penuh (kalau kuota diset) —
// tangani via isAxiosError di caller.
export async function assignVolunteer(
  eventId: number,
  input: AssignVolunteerInput,
): Promise<EventVolunteer> {
  const { data } = await api.post<EventVolunteer>(`/events/${eventId}/volunteers`, input);
  return data;
}

// Kandidat terurut composite score, jemaat baru & konflik jadwal sudah
// dieksklusi backend.
export async function suggestVolunteers(
  eventId: number,
  jenisId: number,
): Promise<SuggestedVolunteer[]> {
  const { data } = await api.get<SuggestedVolunteer[]>(
    `/events/${eventId}/suggest-volunteers/${jenisId}`,
  );
  return data;
}

// durasi_menit wajib dikirim hanya jika TENGAH_EVENT (divalidasi di form).
// 409 kalau jemaat pengganti sudah ditugaskan pada jenis+event yg sama.
export async function replaceVolunteer(
  eventId: number,
  volunteerId: number,
  input: ReplaceVolunteerInput,
): Promise<ReplaceVolunteerResult> {
  const { data } = await api.patch<ReplaceVolunteerResult>(
    `/events/${eventId}/volunteers/${volunteerId}/replace`,
    input,
  );
  return data;
}

// Soft-cancel (status -> DIBATALKAN). Backend tidak mensyaratkan alasan.
export async function cancelVolunteer(eventId: number, volunteerId: number): Promise<EventVolunteer> {
  const { data } = await api.delete<EventVolunteer>(`/events/${eventId}/volunteers/${volunteerId}`);
  return data;
}

// --- Anggota jenis volunteer (utk pencarian manual saat assign/replace) ---
// Endpoint ini secara path ada di bawah /volunteer-types, tapi controllernya
// ada di event module (deferred dari Step 12) — diletakkan di sini karena
// hanya dipakai modul Event.
export async function listVolunteerTypeMembers(jenisId: number): Promise<VolunteerTypeMember[]> {
  const { data } = await api.get<VolunteerTypeMember[]>(`/volunteer-types/${jenisId}/members`);
  return data;
}