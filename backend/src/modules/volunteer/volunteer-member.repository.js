const { getPool } = require('../../config/database');
const { decryptOptional } = require('../../utils/encryption.util');

/**
 * Mendaftarkan jemaat ke sebuah jenis volunteer (BAGIAN keputusan
 * #1: satu jemaat boleh terdaftar di banyak jenis volunteer
 * sekaligus). Constraint UNIQUE(jemaat_id, volunteer_type_id) di
 * schema Step 6 mencegah duplikasi pendaftaran jenis yang sama.
 *
 * @param {number} jemaatId
 * @param {number} volunteerTypeId
 * @returns {Promise<number>} id baris volunteer_members baru
 */
async function register(jemaatId, volunteerTypeId) {
  const pool = getPool();
  const [result] = await pool.query(
    `INSERT INTO volunteer_members (jemaat_id, volunteer_type_id, joined_at, is_active)
     VALUES (:jemaatId, :volunteerTypeId, NOW(), TRUE)`,
    { jemaatId, volunteerTypeId }
  );
  return result.insertId;
}

/**
 * Mengecek apakah jemaat SUDAH terdaftar (aktif maupun nonaktif)
 * untuk jenis volunteer tertentu — dipakai untuk menangkap
 * pelanggaran constraint UNIQUE secara terkendali di service layer
 * sebelum INSERT gagal di level DB.
 *
 * @param {number} jemaatId
 * @param {number} volunteerTypeId
 * @returns {Promise<object|null>}
 */
async function findByJemaatAndType(jemaatId, volunteerTypeId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT * FROM volunteer_members
     WHERE jemaat_id = :jemaatId AND volunteer_type_id = :volunteerTypeId
     LIMIT 1`,
    { jemaatId, volunteerTypeId }
  );
  return rows[0] || null;
}

/**
 * Menonaktifkan pendaftaran volunteer (BAGIAN keputusan #4:
 * soft deactivate, tidak ada DELETE — histori pelayanan terjaga).
 *
 * @param {number} jemaatId
 * @param {number} volunteerTypeId
 */
async function deactivate(jemaatId, volunteerTypeId) {
  const pool = getPool();
  await pool.query(
    `UPDATE volunteer_members SET is_active = FALSE
     WHERE jemaat_id = :jemaatId AND volunteer_type_id = :volunteerTypeId`,
    { jemaatId, volunteerTypeId }
  );
}

/**
 * Mengambil seluruh jenis volunteer aktif yang dimiliki seorang
 * jemaat (BAGIAN keputusan #1: bisa lebih dari satu).
 *
 * @param {number} jemaatId
 * @returns {Promise<Array<object>>}
 */
async function findActiveByJemaat(jemaatId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT vm.id, vm.volunteer_type_id, vj.nama, vm.joined_at
     FROM volunteer_members vm
     JOIN volunteer_jenis vj ON vm.volunteer_type_id = vj.id
     WHERE vm.jemaat_id = :jemaatId AND vm.is_active = TRUE`,
    { jemaatId }
  );
  return rows;
}

/**
 * Mengambil seluruh jemaat yang aktif terdaftar pada sebuah jenis
 * volunteer tertentu — dipakai modul Event (Step 13) untuk
 * Auto-Suggest Volunteer (BAGIAN 5.4).
 *
 * @param {number} volunteerTypeId
 * @returns {Promise<Array<object>>}
 */
async function findActiveByType(volunteerTypeId) {
  const pool = getPool();
  // j.nama tersimpan sebagai ciphertext (migration 005) — dekripsi
  // di level aplikasi memakai j.nama_iv sebelum dikembalikan.
  const [rows] = await pool.query(
    `SELECT vm.id, j.id AS jemaat_id, j.nama, j.nama_iv, j.is_new_member,
            j.skor_keaktifan, j.status_keaktifan
     FROM volunteer_members vm
     JOIN jemaat j ON vm.jemaat_id = j.id
     WHERE vm.volunteer_type_id = :volunteerTypeId
       AND vm.is_active = TRUE
       AND j.deleted_at IS NULL`,
    { volunteerTypeId }
  );
  return rows.map(({ nama_iv, ...row }) => ({
    ...row,
    nama: decryptOptional(row.nama, nama_iv),
  }));
}

module.exports = {
  register,
  findByJemaatAndType,
  deactivate,
  findActiveByJemaat,
  findActiveByType,
};