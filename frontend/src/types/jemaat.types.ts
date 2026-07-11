export type StatusKeaktifan = 'AKTIF' | 'KURANG_AKTIF' | 'TIDAK_AKTIF' | 'BELUM_CUKUP_DATA';

// Backend hanya menyimpan sebagai TEXT (tidak ada CHECK constraint di DB,
// karena kolomnya ciphertext). Kita batasi di UI ke 'L' | 'P' sesuai asumsi
// di prompt; kalau ternyata ada nilai lain di data seed, cukup ubah di sini.
export type JenisKelamin = 'L' | 'P';

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

export interface MediaSosial {
  instagram?: string;
}

// GET /jemaat/:id/full — semua field plaintext (BAGIAN 2.2 backend)
export interface JemaatFull {
  id: number;
  nama: string;
  tgl_lahir: string;
  jenis_kelamin: string;
  tgl_bergabung: string | null;
  no_hp: string | null;
  alamat: string | null;
  media_sosial: MediaSosial | null;
  is_active: boolean;
  is_new_member: boolean;
  new_member_until: string | null;
  is_non_cg: boolean;
  skor_keaktifan: number | null;
  status_keaktifan: StatusKeaktifan;
  created_at: string;
  // Cell Group aktif yang dipimpin jemaat ini (kosong kalau bukan leader).
  leading_cell_groups: { id: number; nama: string }[];
}

export interface DuplicateCandidate {
  id: number;
  nama: string;
}

export interface JemaatDuplicateCandidates {
  byNameAndBirthdate: DuplicateCandidate[];
  byPhone: DuplicateCandidate[];
}

export interface CgDependency {
  id: number;
  nama: string;
}

export interface VolunteerDependency {
  id: number;
  judul: string;
  waktu_mulai: string;
}

// Bentuk persis dari jemaat.repository.js -> checkDependencies()
export interface JemaatDependencies {
  isLeaderOfActiveCg: CgDependency[];
  scheduledAsVolunteer: VolunteerDependency[];
  activeMemberOfCg: CgDependency[];
}

export interface JemaatEventHistory {
  id: number;
  judul: string;
  jenis: string;
  waktu_mulai: string;
  waktu_selesai: string;
  status: string;
  hadir_at: string;
}

// GET /jemaat/:id/cell-groups belum ada padanan endpoint riwayat kehadiran
// meeting CG — ini dia: dari cg_absensi (hadir = TRUE), dipakai Timeline
// Aktivitas supaya selaras dengan sumber data skoring keaktifan.
export interface JemaatCgAttendance {
  meeting_id: number;
  judul: string;
  jenis: string;
  waktu_mulai: string;
  waktu_selesai: string;
  cg_id: number;
  nama_cg: string;
}

// GET /jemaat/:id/volunteer-assignments — penugasan event_volunteer per
// jemaat (BEDA dari registrasi jenis volunteer di JemaatVolunteerHistory),
// semua status (AKTIF/BERTUGAS_PARSIAL/DIGANTIKAN/DIBATALKAN).
export interface JemaatVolunteerAssignment {
  id: number;
  event_id: number;
  judul: string;
  event_jenis: string;
  waktu_mulai: string;
  waktu_selesai: string;
  nama_jenis_volunteer: string;
  status: 'AKTIF' | 'BERTUGAS_PARSIAL' | 'DIGANTIKAN' | 'DIBATALKAN';
  durasi_menit: number | null;
  created_at: string;
}

export interface JemaatVolunteerHistory {
  id: number;
  volunteer_type_id: number;
  nama: string;
  joined_at: string;
}

export interface CreateJemaatInput {
  nama: string;
  tgl_lahir: string;
  jenis_kelamin: string;
  tgl_bergabung?: string;
  no_hp?: string;
  alamat?: string;
  media_sosial?: MediaSosial;
}

// PUT /jemaat/:id menerima field ini secara parsial. is_new_member/
// new_member_until/is_non_cg SENGAJA tidak ada di sini — backend
// mengabaikannya, jadi kita tidak pernah mengirimkannya.
export type UpdateJemaatInput = Partial<CreateJemaatInput> & {
  is_active?: boolean;
};