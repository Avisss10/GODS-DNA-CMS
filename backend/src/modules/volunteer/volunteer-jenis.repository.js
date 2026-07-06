const { getPool } = require('../../config/database');

/**
 * Membuat jenis volunteer baru (master data pelayanan gereja).
 * @param {{ nama: string, deskripsi?: string }} data
 * @returns {Promise<number>} id jenis volunteer baru
 */
async function create({ nama, deskripsi = null }) {
  const pool = getPool();
  const [result] = await pool.query(
    `INSERT INTO volunteer_jenis (nama, deskripsi, is_active)
     VALUES (:nama, :deskripsi, TRUE)`,
    { nama, deskripsi }
  );
  return result.insertId;
}

/**
 * Mencari jenis volunteer by id.
 * @param {number} id
 * @returns {Promise<object|null>}
 */
async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT * FROM volunteer_jenis WHERE id = :id LIMIT 1',
    { id }
  );
  return rows[0] || null;
}

/**
 * Mencari jenis volunteer by nama (untuk cek duplikasi nama —
 * kolom nama bersifat UNIQUE di schema Step 6).
 * @param {string} nama
 * @returns {Promise<object|null>}
 */
async function findByNama(nama) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT * FROM volunteer_jenis WHERE nama = :nama LIMIT 1',
    { nama }
  );
  return rows[0] || null;
}

/**
 * Memperbarui nama/deskripsi jenis volunteer.
 * @param {number} id
 * @param {{ nama?: string, deskripsi?: string }} updates
 */
async function update(id, updates) {
  const pool = getPool();
  const setClauses = [];
  const params = { id };

  if (updates.nama !== undefined) {
    setClauses.push('nama = :nama');
    params.nama = updates.nama;
  }
  if (updates.deskripsi !== undefined) {
    setClauses.push('deskripsi = :deskripsi');
    params.deskripsi = updates.deskripsi;
  }

  if (setClauses.length === 0) {
    return;
  }

  await pool.query(
    `UPDATE volunteer_jenis SET ${setClauses.join(', ')} WHERE id = :id`,
    params
  );
}

/**
 * Mengaktifkan/menonaktifkan jenis volunteer (BAGIAN keputusan #4:
 * tidak ada hard delete, hanya is_active flag).
 * @param {number} id
 * @param {boolean} isActive
 */
async function setActive(id, isActive) {
  const pool = getPool();
  await pool.query(
    'UPDATE volunteer_jenis SET is_active = :isActive WHERE id = :id',
    { id, isActive }
  );
}

/**
 * Mengambil seluruh jenis volunteer yang aktif.
 * @returns {Promise<Array<object>>}
 */
async function findAllActive() {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT * FROM volunteer_jenis WHERE is_active = TRUE ORDER BY nama'
  );
  return rows;
}

/**
 * Ambil SEMUA jenis volunteer (aktif maupun nonaktif) beserta jumlah
 * anggota aktif per tipe. Kolom is_active ikut dikembalikan — frontend
 * yang membedakan tampilannya. Konsumen yang butuh hanya jenis aktif
 * (validasi internal dsb.) tetap memakai findAllActive().
 * @returns {Promise<Array<object>>}
 */
async function findAll() {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT vj.id, vj.nama, vj.deskripsi, vj.is_active,
            COUNT(vm.id) AS jumlah_anggota
     FROM volunteer_jenis vj
     LEFT JOIN volunteer_members vm ON vm.volunteer_type_id = vj.id AND vm.is_active = TRUE
     GROUP BY vj.id, vj.nama, vj.deskripsi, vj.is_active
     ORDER BY vj.nama ASC`
  );
  return rows;
}

module.exports = {
  create,
  findById,
  findByNama,
  findAll,
  update,
  setActive,
  findAllActive,
};