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
  facebook?: string;
  whatsapp?: string;
  [key: string]: string | undefined;
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

export interface JemaatCellGroup {
  id: number;
  nama: string;
  deskripsi: string | null;
  is_active: boolean;
  joined_at: string;
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