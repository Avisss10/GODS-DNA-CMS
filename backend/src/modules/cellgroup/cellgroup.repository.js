const { getPool } = require('../../config/database');

/**
 * Membuat CG baru sekaligus mendaftarkan leader sebagai anggota
 * pertama (BAGIAN 3.1 langkah 3-4). Dua INSERT dijalankan
 * berurutan dalam satu fungsi (bukan transaction eksplisit —
 * dokumen tidak mensyaratkan transaction untuk operasi ini,
 * berbeda dengan BAGIAN 5.5 assign volunteer yang eksplisit
 * membutuhkan pessimistic lock).
 *
 * @param {{ nama: string, deskripsi?: string, leaderId: number }} data
 * @returns {Promise<number>} id CG baru
 */
async function create({ nama, deskripsi = null, leaderId }) {
  const pool = getPool();

  const [result] = await pool.query(
    `INSERT INTO cell_group (nama, deskripsi, leader_id, is_active)
     VALUES (:nama, :deskripsi, :leaderId, TRUE)`,
    { nama, deskripsi, leaderId }
  );

  const cgId = result.insertId;

  await pool.query(
    `INSERT INTO cell_group_members (cg_id, jemaat_id, joined_at)
     VALUES (:cgId, :jemaatId, NOW())`,
    { cgId, jemaatId: leaderId }
  );

  return cgId;
}

/**
 * Mencari CG by id (yang belum soft-deleted).
 * @param {number} id
 * @returns {Promise<object|null>}
 */
async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT * FROM cell_group WHERE id = :id AND deleted_at IS NULL LIMIT 1',
    { id }
  );
  return rows[0] || null;
}

/**
 * Mengecek apakah CG punya leader yang aktif (leader_id terisi
 * dan jemaat tersebut masih is_active). Dipakai untuk validasi
 * BAGIAN 3.3: "CG harus punya leader aktif" sebelum buat meeting.
 *
 * @param {number} cgId
 * @returns {Promise<object|null>} data jemaat leader, atau null jika tidak ada/tidak aktif
 */
async function findActiveLeader(cgId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT j.* FROM cell_group cg
     JOIN jemaat j ON cg.leader_id = j.id
     WHERE cg.id = :cgId AND j.is_active = TRUE AND j.deleted_at IS NULL
     LIMIT 1`,
    { cgId }
  );
  return rows[0] || null;
}

/**
 * Mengecek apakah seorang jemaat saat ini adalah anggota AKTIF
 * (left_at IS NULL) dari CG tertentu — dipakai addMember() untuk
 * mencegah duplikasi pendaftaran (BAGIAN 3.2 TAMBAH langkah 1).
 *
 * @param {number} cgId
 * @param {number} jemaatId
 * @returns {Promise<boolean>}
 */
async function isJemaatActiveMember(cgId, jemaatId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id FROM cell_group_members
     WHERE cg_id = :cgId AND jemaat_id = :jemaatId AND left_at IS NULL
     LIMIT 1`,
    { cgId, jemaatId }
  );
  return rows.length > 0;
}

/**
 * Menambah anggota baru ke CG (BAGIAN 3.2 TAMBAH).
 * @param {number} cgId
 * @param {number} jemaatId
 * @returns {Promise<number>} id baris cell_group_members baru
 */
async function addMember(cgId, jemaatId) {
  const pool = getPool();
  const [result] = await pool.query(
    `INSERT INTO cell_group_members (cg_id, jemaat_id, joined_at)
     VALUES (:cgId, :jemaatId, NOW())`,
    { cgId, jemaatId }
  );
  return result.insertId;
}

/**
 * Mengeluarkan anggota dari CG — set left_at, BUKAN delete
 * (BAGIAN 3.2 HAPUS: data historis tetap ada untuk scoring).
 *
 * @param {number} cgId
 * @param {number} jemaatId
 */
async function removeMember(cgId, jemaatId) {
  const pool = getPool();
  await pool.query(
    `UPDATE cell_group_members SET left_at = NOW()
     WHERE cg_id = :cgId AND jemaat_id = :jemaatId AND left_at IS NULL`,
    { cgId, jemaatId }
  );
}

/**
 * Mengambil daftar anggota aktif (left_at IS NULL) dari sebuah CG.
 * @param {number} cgId
 * @returns {Promise<Array<object>>}
 */
async function findActiveMembers(cgId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT j.id, j.nama, cgm.joined_at
     FROM cell_group_members cgm
     JOIN jemaat j ON cgm.jemaat_id = j.id
     WHERE cgm.cg_id = :cgId AND cgm.left_at IS NULL AND j.deleted_at IS NULL`,
    { cgId }
  );
  return rows;
}

module.exports = {
  create,
  findById,
  findActiveLeader,
  isJemaatActiveMember,
  addMember,
  removeMember,
  findActiveMembers,
};