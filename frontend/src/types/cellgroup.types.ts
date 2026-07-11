export type JenisMeeting = 'ONLINE' | 'OFFLINE';

// GET /cell-groups — hanya CG aktif, sudah include nama_leader & jumlah_anggota
export interface CellGroupListItem {
  id: number;
  nama: string;
  deskripsi: string | null;
  is_active: boolean;
  created_at: string;
  nama_leader: string | null;
  jumlah_anggota: number;
}

// GET /cell-groups/:id — row mentah tabel cell_group.
// SENGAJA TIDAK PUNYA nama_leader/jumlah_anggota (beda dgn list di atas) —
// verifikasi ke cellgroup.repository.js: findById() cuma SELECT * FROM cell_group.
// Detail page menggabungkan ini dengan data leader (via jemaat.api) dan
// anggota (via getActiveMembers) secara terpisah.
export interface CellGroupDetail {
  id: number;
  nama: string;
  deskripsi: string | null;
  leader_id: number | null;
  is_active: boolean;
  created_at: string;
  deleted_at: string | null;
}

export interface CellGroupMember {
  id: number; // id jemaat
  nama: string;
  joined_at: string;
  is_leader: boolean;
}

export interface CgMeetingListItem {
  id: number;
  judul: string;
  jenis: JenisMeeting;
  waktu_mulai: string;
  waktu_selesai: string;
  catatan: string | null;
  created_at: string;
  jumlah_foto: number;
}

// GET /cell-groups/meetings/:meetingId — row mentah tabel cg_meeting (ada cg_id)
export interface CgMeetingDetail {
  id: number;
  cg_id: number;
  judul: string;
  jenis: JenisMeeting;
  waktu_mulai: string;
  waktu_selesai: string;
  catatan: string | null;
  created_by: number | null;
  created_at: string;
}

export interface CgMeetingPhoto {
  id: number;
  file_size_kb: number;
  uploaded_by: number | null;
  created_at: string;
}

export interface ActiveMemberAtMeeting {
  id: number;
  nama: string;
  is_leader: boolean;
}

// GET /cell-groups/meetings/:meetingId/absensi — absensi tersimpan
export interface AbsensiRecord {
  jemaat_id: number;
  nama: string;
  hadir: boolean;
}

// POST /cell-groups — camelCase (leaderId)
export interface CreateCellGroupInput {
  nama: string;
  deskripsi?: string;
  leaderId: number;
}

// PUT /cell-groups/:id — snake_case (leader_id) — BEDA dengan create
export interface UpdateCellGroupInput {
  nama?: string;
  deskripsi?: string;
  leader_id?: number;
}

// POST /cell-groups/:id/meetings — camelCase
export interface CreateMeetingInput {
  judul: string;
  jenis: JenisMeeting;
  waktuMulai: string;
  waktuSelesai: string;
  catatan?: string;
}

// PUT /cell-groups/meetings/:meetingId — snake_case — BEDA dengan create
export interface UpdateMeetingInput {
  judul?: string;
  jenis?: JenisMeeting;
  waktu_mulai?: string;
  waktu_selesai?: string;
  catatan?: string;
}

export interface AbsensiEntry {
  jemaatId: number;
  hadir: boolean;
}