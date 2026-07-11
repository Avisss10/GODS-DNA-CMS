const { getPool } = require('../../config/database');
const { decryptOptional } = require('../../utils/encryption.util');

/**
 * Membuat meeting baru untuk sebuah CG (BAGIAN 3.3 langkah 3).
 * Precondition (leader aktif) divalidasi di service layer, BUKAN
 * di sini — repository hanya bertanggung jawab atas persistensi.
 *
 * @param {{ cgId: number, judul: string, jenis: 'ONLINE'|'OFFLINE', waktuMulai: string, waktuSelesai: string, catatan?: string, createdBy: number }} data
 * @returns {Promise<number>} id meeting baru
 */
async function createMeeting({ cgId, judul, jenis, waktuMulai, waktuSelesai, catatan = null, createdBy }) {
  const pool = getPool();
  const [result] = await pool.query(
    `INSERT INTO cg_meeting (cg_id, judul, jenis, waktu_mulai, waktu_selesai, catatan, created_by)
     VALUES (:cgId, :judul, :jenis, :waktuMulai, :waktuSelesai, :catatan, :createdBy)`,
    { cgId, judul, jenis, waktuMulai, waktuSelesai, catatan, createdBy }
  );
  return result.insertId;
}

/**
 * Mencari meeting by id.
 * @param {number} id
 * @returns {Promise<object|null>}
 */
async function findMeetingById(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT * FROM cg_meeting WHERE id = :id LIMIT 1',
    { id }
  );
  return rows[0] || null;
}

/**
 * Menambahkan satu foto dokumentasi meeting (BAGIAN 3.3 langkah 2).
 * file_path dan file_size_kb diasumsikan sudah final (sudah
 * dikompresi oleh service layer/upload handler sebelum dipanggil).
 *
 * @param {{ meetingId: number, filePath: string, fileSizeKb: number, uploadedBy: number }} data
 * @returns {Promise<number>} id foto baru
 */
async function addMeetingPhoto({ meetingId, filePath, fileSizeKb, uploadedBy }) {
  const pool = getPool();
  const [result] = await pool.query(
    `INSERT INTO cg_meeting_photos (meeting_id, file_path, file_size_kb, uploaded_by)
     VALUES (:meetingId, :filePath, :fileSizeKb, :uploadedBy)`,
    { meetingId, filePath, fileSizeKb, uploadedBy }
  );
  return result.insertId;
}

/**
 * Menghitung jumlah foto yang sudah ada untuk sebuah meeting —
 * dipakai service layer untuk validasi maks 10 foto (BAGIAN 3.3)
 * SEBELUM memanggil addMeetingPhoto().
 *
 * @param {number} meetingId
 * @returns {Promise<number>}
 */
async function countMeetingPhotos(meetingId) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS total FROM cg_meeting_photos WHERE meeting_id = :meetingId',
    { meetingId }
  );
  return Number(rows[0].total);
}

/**
 * Mengambil daftar foto sebuah meeting (tanpa file_path — konsumen
 * list tidak perlu tahu lokasi file di disk).
 *
 * @param {number} meetingId
 * @returns {Promise<Array<object>>}
 */
async function findPhotosByMeetingId(meetingId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, file_size_kb, uploaded_by, uploaded_at AS created_at
     FROM cg_meeting_photos
     WHERE meeting_id = :meetingId
     ORDER BY uploaded_at ASC`,
    { meetingId }
  );
  return rows;
}

/**
 * Mencari satu foto by id (termasuk file_path untuk streaming/hapus).
 * @param {number} id
 * @returns {Promise<object|null>}
 */
async function findPhotoById(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT * FROM cg_meeting_photos WHERE id = :id LIMIT 1',
    { id }
  );
  return rows[0] || null;
}

/**
 * Menghapus record foto meeting. Penghapusan file di disk adalah
 * tanggung jawab service layer.
 * @param {number} id
 */
async function deleteMeetingPhoto(id) {
  const pool = getPool();
  await pool.query('DELETE FROM cg_meeting_photos WHERE id = :id', { id });
}

/**
 * Mengambil anggota CG yang aktif PADA SAAT meeting berlangsung
 * (BAGIAN 3.4 langkah 1, dikutip persis):
 * "left_at IS NULL ATAU left_at > waktu meeting"
 *
 * Ini berbeda dari findActiveMembers() di cellgroup.repository.js
 * (yang hanya cek status aktif SAAT INI) — fungsi ini
 * mempertimbangkan histori, supaya anggota yang keluar SETELAH
 * meeting tetap muncul di form absensi meeting tersebut.
 *
 * @param {number} cgId
 * @param {string} waktuMeeting - datetime string
 * @returns {Promise<Array<object>>}
 */
async function findActiveMembersAtMeetingTime(cgId, waktuMeeting) {
  const pool = getPool();
  // j.nama tersimpan sebagai ciphertext (migration 005) — dekripsi
  // di level aplikasi memakai j.nama_iv sebelum dikembalikan. is_leader
  // dibandingkan dari leader_id CG saat ini, supaya form absensi juga
  // bisa menandai leader (sama seperti daftar anggota).
  const [rows] = await pool.query(
    `SELECT j.id, j.nama, j.nama_iv, (cg.leader_id = j.id) AS is_leader
     FROM cell_group_members cgm
     JOIN jemaat j ON cgm.jemaat_id = j.id
     JOIN cell_group cg ON cgm.cg_id = cg.id
     WHERE cgm.cg_id = :cgId
       AND (cgm.left_at IS NULL OR cgm.left_at > :waktuMeeting)
       AND j.deleted_at IS NULL`,
    { cgId, waktuMeeting }
  );
  return rows.map(({ nama_iv, ...row }) => ({
    ...row,
    nama: decryptOptional(row.nama, nama_iv),
    is_leader: Boolean(row.is_leader),
  }));
}

/**
 * UPSERT absensi per jemaat per meeting (BAGIAN 3.4 langkah 3).
 * Memanfaatkan UNIQUE constraint (meeting_id, jemaat_id) yang
 * sudah ada di schema Step 6.
 *
 * @param {number} meetingId
 * @param {number} jemaatId
 * @param {boolean} hadir
 */
async function upsertAbsensi(meetingId, jemaatId, hadir, connection) {
  const executor = connection || getPool();
  await executor.query(
    `INSERT INTO cg_absensi (meeting_id, jemaat_id, hadir)
     VALUES (:meetingId, :jemaatId, :hadir)
     ON DUPLICATE KEY UPDATE hadir = :hadir`,
    { meetingId, jemaatId, hadir }
  );
}

/**
 * Mengambil seluruh data absensi untuk satu meeting.
 * @param {number} meetingId
 * @returns {Promise<Array<object>>}
 */
async function findAbsensiByMeeting(meetingId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT ca.jemaat_id, j.nama, j.nama_iv, ca.hadir
     FROM cg_absensi ca
     JOIN jemaat j ON ca.jemaat_id = j.id
     WHERE ca.meeting_id = :meetingId`,
    { meetingId }
  );
  return rows.map(({ nama_iv, ...row }) => ({
    ...row,
    nama: decryptOptional(row.nama, nama_iv),
  }));
}

/**
 * Mengambil list meeting milik sebuah CG, diurutkan terbaru dulu.
 * Menyertakan jumlah foto per meeting untuk keperluan tampilan.
 *
 * @param {number} cgId
 * @param {{ limit?: number, offset?: number }} options
 * @returns {Promise<Array<object>>}
 */
async function findMeetingsByCgId(cgId, { limit = 20, offset = 0 } = {}) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT m.id, m.judul, m.jenis, m.waktu_mulai, m.waktu_selesai, m.catatan, m.created_at,
            COUNT(p.id) AS jumlah_foto
     FROM cg_meeting m
     LEFT JOIN cg_meeting_photos p ON p.meeting_id = m.id
     WHERE m.cg_id = :cgId
     GROUP BY m.id
     ORDER BY m.waktu_mulai DESC
     LIMIT :limit OFFSET :offset`,
    { cgId, limit: Number(limit), offset: Number(offset) }
  );
  return rows;
}

/**
 * Update data meeting. Hanya field yang disertakan dalam `updates` yang diubah.
 *
 * @param {number} meetingId
 * @param {{ judul?, jenis?, waktu_mulai?, waktu_selesai?, catatan? }} updates
 */
async function updateMeeting(meetingId, updates) {
  const pool = getPool();
  const setClauses = [];
  const params = { meetingId };

  const fieldMap = {
    judul: 'judul',
    jenis: 'jenis',
    waktu_mulai: 'waktu_mulai',
    waktu_selesai: 'waktu_selesai',
    catatan: 'catatan',
  };

  for (const [field, column] of Object.entries(fieldMap)) {
    if (updates[field] !== undefined) {
      setClauses.push(`${column} = :${field}`);
      params[field] = updates[field];
    }
  }

  if (setClauses.length === 0) return;

  await pool.query(
    `UPDATE cg_meeting SET ${setClauses.join(', ')} WHERE id = :meetingId`,
    params
  );
}

/**
 * Riwayat kehadiran meeting CG seorang jemaat (hanya yang hadir),
 * dipakai Timeline Aktivitas di Jemaat Detail Page — join sama persis
 * dengan yang dipakai scoring.repository.js getCGAttendanceSummary
 * (cg_absensi.hadir = TRUE, join cg_meeting), tapi di sini per-baris
 * untuk ditampilkan, bukan agregat untuk hitung skor.
 *
 * @param {number} jemaatId
 * @param {{ limit?: number, offset?: number }} options
 * @returns {Promise<Array<object>>}
 */
async function findAbsensiHistoryByJemaat(jemaatId, { limit = 50, offset = 0 } = {}) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT cm.id AS meeting_id, cm.judul, cm.jenis, cm.waktu_mulai, cm.waktu_selesai,
            cg.id AS cg_id, cg.nama AS nama_cg
     FROM cg_absensi ca
     JOIN cg_meeting cm ON ca.meeting_id = cm.id
     JOIN cell_group cg ON cm.cg_id = cg.id
     WHERE ca.jemaat_id = :jemaatId AND ca.hadir = TRUE
     ORDER BY cm.waktu_mulai DESC
     LIMIT :limit OFFSET :offset`,
    { jemaatId, limit: Number(limit), offset: Number(offset) }
  );
  return rows;
}

module.exports = {
  createMeeting,
  findMeetingById,
  findMeetingsByCgId,
  addMeetingPhoto,
  countMeetingPhotos,
  findPhotosByMeetingId,
  findPhotoById,
  deleteMeetingPhoto,
  findActiveMembersAtMeetingTime,
  upsertAbsensi,
  findAbsensiByMeeting,
  findAbsensiHistoryByJemaat,
  updateMeeting,
};