// Kontrak: backend/src/modules/event/*.js — snake_case di semua body
// (beda dgn Cell Group yg camelCase utk create).

export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'AKTIF' | 'SELESAI' | 'DIARSIPKAN';
export type AbsensiStatus = 'OPEN' | 'CLOSED';

// GET /events, GET /events?status=
export interface EventListItem {
  id: number;
  judul: string;
  jenis: string;
  waktu_mulai: string;
  waktu_selesai: string;
  deskripsi: string | null;
  status: EventStatus;
  absensi_status: AbsensiStatus;
}

// GET /events/:id — row mentah tabel event (ada created_by/created_at tambahan)
export interface EventDetail extends EventListItem {
  created_by: number | null;
  created_at: string;
}

// POST /events — status otomatis DRAFT di backend, tidak dikirim dari FE
export interface CreateEventInput {
  judul: string;
  jenis: string;
  waktu_mulai: string;
  waktu_selesai: string;
  deskripsi?: string;
}

// PUT /events/:id — parsial, hanya field yg diisi dikirim
export type UpdateEventInput = Partial<CreateEventInput>;

// Peta transisi resmi (event.service.js VALID_STATUS_TRANSITIONS) —
// duplikat sengaja di FE supaya tombol bisa langsung difilter tanpa
// menunggu request PATCH gagal dulu.
export const EVENT_STATUS_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  DRAFT: ['PUBLISHED'],
  PUBLISHED: ['AKTIF', 'DIARSIPKAN'],
  AKTIF: ['SELESAI'],
  SELESAI: ['DIARSIPKAN'],
  DIARSIPKAN: [],
};

// Status event yg masih mengizinkan mutasi kebutuhan & penugasan volunteer
export const VOLUNTEER_MUTABLE_STATUSES: EventStatus[] = ['DRAFT', 'PUBLISHED', 'AKTIF'];

// --- Kehadiran ---

// GET /events/:id/kehadiran — 404 kalau belum diinput (ditangani di api layer, return null)
export interface EventKehadiran {
  event_id: number;
  total_hadir: number;
  jemaat_baru: number;
}

export interface InputKehadiranInput {
  total_hadir: number;
  jemaat_baru?: number;
}

// --- Kebutuhan Volunteer (kuota) ---

// GET /events/:id/volunteer-needs
export interface VolunteerNeed {
  id: number;
  volunteer_type_id: number;
  nama_jenis: string;
  kuota: number;
  jumlah_terisi: number;
}

// PUT /events/:id/volunteer-needs — kirim SELURUH daftar (upsert penuh)
export interface UpdateVolunteerNeedsInput {
  needs: { jenis_id: number; kuota: number }[];
}

// --- Assignment Volunteer ---

export type VolunteerAssignmentStatus = 'AKTIF' | 'DIGANTIKAN' | 'BERTUGAS_PARSIAL' | 'DIBATALKAN';
export type ReplacementTiming = 'SEBELUM_EVENT' | 'TENGAH_EVENT';

// GET /events/:id/volunteers — hanya penugasan AKTIF
export interface EventVolunteer {
  id: number;
  jemaat_id: number;
  nama_jemaat: string;
  jenis_id: number;
  nama_jenis: string;
  status: VolunteerAssignmentStatus;
  replacement_timing: ReplacementTiming | null;
  replaced_by: number | null;
  durasi_menit: number | null;
  created_at: string;
}

// POST /events/:id/volunteers
export interface AssignVolunteerInput {
  jemaat_id: number;
  jenis_id: number;
}

// PATCH /events/:id/volunteers/:volunteerId/replace
// durasi_menit wajib HANYA jika replacement_timing === 'TENGAH_EVENT'
export interface ReplaceVolunteerInput {
  replacement_timing: ReplacementTiming;
  replaced_by: number;
  alasan: string;
  durasi_menit?: number;
}

export interface ReplaceVolunteerResult {
  penugasan_lama: EventVolunteer;
  penugasan_baru: EventVolunteer;
}

// GET /events/:id/suggest-volunteers/:jenisId
export interface SuggestedVolunteer {
  id: number;
  jemaat_id: number;
  nama: string;
  is_new_member: boolean;
  skor_keaktifan: number | null;
  status_keaktifan: string;
  jumlah_tugas_30_hari: number;
  s_frek: number;
  s_aktif: number;
  s_sesuai: number;
  composite_score: number;
}

// GET /volunteer-types/:id/members — dipakai utk cari manual saat assign,
// dan halaman detail jenis volunteer (modul Volunteer).
export interface VolunteerTypeMember {
  id: number;
  jemaat_id: number;
  nama: string;
  is_new_member: boolean;
  skor_keaktifan: number | null;
  status_keaktifan: string;
  joined_at: string;
}