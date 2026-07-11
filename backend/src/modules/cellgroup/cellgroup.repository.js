const { getPool } = require('../../config/database');
const { decryptOptional } = require('../../utils/encryption.util');

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
  // j.nama tersimpan sebagai ciphertext (migration 005) — dekripsi
  // di level aplikasi memakai j.nama_iv sebelum dikembalikan.
  // is_leader dibandingkan dari cell_group.leader_id terkini, supaya FE
  // bisa menandai leader di daftar anggota (bukan cuma tampil di kartu info CG).
  const [rows] = await pool.query(
    `SELECT j.id, j.nama, j.nama_iv, cgm.joined_at, (cg.leader_id = j.id) AS is_leader
     FROM cell_group_members cgm
     JOIN jemaat j ON cgm.jemaat_id = j.id
     JOIN cell_group cg ON cgm.cg_id = cg.id
     WHERE cgm.cg_id = :cgId AND cgm.left_at IS NULL AND j.deleted_at IS NULL`,
    { cgId }
  );
  return rows.map(({ nama_iv, ...row }) => ({
    ...row,
    nama: decryptOptional(row.nama, nama_iv),
    is_leader: Boolean(row.is_leader),
  }));
}

/**
 * Ambil semua cell group aktif.
 * @param {{ limit?, offset? }} options
 * @returns {Promise<Array<object>>}
 */
async function findAll({ limit = 50, offset = 0 } = {}) {
  const pool = getPool();
  // Nama leader (j.nama) tersimpan sebagai ciphertext (migration 005)
  // — dekripsi di level aplikasi memakai IV-nya.
  const [rows] = await pool.query(
    `SELECT cg.id, cg.nama, cg.deskripsi, cg.is_active,
            cg.created_at, j.nama AS nama_leader, j.nama_iv AS nama_leader_iv,
            COUNT(cgm.id) AS jumlah_anggota
     FROM cell_group cg
     LEFT JOIN jemaat j ON cg.leader_id = j.id
     LEFT JOIN cell_group_members cgm ON cgm.cg_id = cg.id AND cgm.left_at IS NULL
     WHERE cg.is_active = TRUE AND cg.deleted_at IS NULL
     GROUP BY cg.id, cg.nama, cg.deskripsi, cg.is_active, cg.created_at, j.nama, j.nama_iv
     ORDER BY cg.nama ASC
     LIMIT :limit OFFSET :offset`,
    { limit: Number(limit), offset: Number(offset) }
  );
  return rows.map(({ nama_leader_iv, ...row }) => ({
    ...row,
    nama_leader: decryptOptional(row.nama_leader, nama_leader_iv),
  }));
}

/**
 * Update data CG. Hanya field yang disertakan dalam `updates` yang diubah.
 *
 * @param {number} id
 * @param {{ nama?, deskripsi?, leader_id? }} updates
 */
async function update(id, updates) {
  const pool = getPool();
  const setClauses = [];
  const params = { id };

  const fieldMap = {
    nama: 'nama',
    deskripsi: 'deskripsi',
    leader_id: 'leader_id',
  };

  for (const [field, column] of Object.entries(fieldMap)) {
    if (updates[field] !== undefined) {
      setClauses.push(`${column} = :${field}`);
      params[field] = updates[field];
    }
  }

  if (setClauses.length === 0) return;

  await pool.query(
    `UPDATE cell_group SET ${setClauses.join(', ')} WHERE id = :id`,
    params
  );
}

/**
 * Menghitung jumlah anggota aktif (left_at IS NULL) dalam sebuah CG.
 * Dipakai sebelum deactivate untuk mencegah CG dengan anggota aktif dihapus.
 *
 * @param {number} cgId
 * @returns {Promise<number>}
 */
async function countActiveMembers(cgId) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS total FROM cell_group_members WHERE cg_id = :cgId AND left_at IS NULL',
    { cgId }
  );
  return Number(rows[0].total);
}

/**
 * Soft-delete CG: set is_active=FALSE dan deleted_at=NOW().
 * @param {number} id
 */
async function deactivate(id) {
  const pool = getPool();
  await pool.query(
    'UPDATE cell_group SET is_active = FALSE, deleted_at = NOW() WHERE id = :id',
    { id }
  );
}

/**
 * Mencari CG by id TERMASUK yang sudah soft-deleted — dipakai alur
 * reaktivasi, karena findById() sengaja menyaring deleted_at IS NULL.
 * @param {number} id
 * @returns {Promise<object|null>}
 */
async function findByIdIncludingDeleted(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT * FROM cell_group WHERE id = :id LIMIT 1',
    { id }
  );
  return rows[0] || null;
}

/**
 * Reaktivasi CG yang sudah dinonaktifkan: is_active=TRUE, deleted_at=NULL.
 * @param {number} id
 */
async function activate(id) {
  const pool = getPool();
  await pool.query(
    'UPDATE cell_group SET is_active = TRUE, deleted_at = NULL WHERE id = :id',
    { id }
  );
}

module.exports = {
  create,
  findById,
  findActiveLeader,
  isJemaatActiveMember,
  addMember,
  removeMember,
  findActiveMembers,
  findAll,
  update,
  countActiveMembers,
  deactivate,
  findByIdIncludingDeleted,
  activate,
};