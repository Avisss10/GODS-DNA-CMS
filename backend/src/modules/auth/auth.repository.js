const { getPool } = require('../../config/database');

/**
 * Mencari user berdasarkan username. Mengembalikan null jika tidak
 * ditemukan — caller (service layer) bertanggung jawab menerjemahkan
 * ini ke pesan error yang sesuai (BAGIAN 1.1 langkah 2: jangan bedakan
 * pesan error username vs password).
 *
 * @param {string} username
 * @returns {Promise<object|null>}
 */
async function findByUsername(username) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE username = :username LIMIT 1',
    { username }
  );
  return rows[0] || null;
}

/**
 * Mencari user berdasarkan id.
 * @param {number} id
 * @returns {Promise<object|null>}
 */
async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT * FROM users WHERE id = :id LIMIT 1',
    { id }
  );
  return rows[0] || null;
}

/**
 * Membuat user baru. Dipakai oleh seed script (setup awal) — BAGIAN 11
 * tidak menyebut endpoint registrasi via API, hanya "Setup minimal 2
 * akun Leader" sebagai langkah setup awal sistem.
 *
 * @param {{ username: string, passwordHash: string, peran: 'LEADER'|'ADMIN' }} data
 * @returns {Promise<number>} id user baru
 */
async function createUser({ username, passwordHash, peran }) {
  const pool = getPool();
  const [result] = await pool.query(
    `INSERT INTO users (username, password_hash, peran, aktif)
     VALUES (:username, :passwordHash, :peran, TRUE)`,
    { username, passwordHash, peran }
  );
  return result.insertId;
}

/**
 * Memperbarui last_login_at user — BAGIAN 1.1 langkah 12.
 * @param {number} id
 */
async function updateLastLogin(id) {
  const pool = getPool();
  await pool.query(
    'UPDATE users SET last_login_at = NOW() WHERE id = :id',
    { id }
  );
}

/**
 * Mengaktifkan/menonaktifkan user (aktif = true/false).
 * Dipakai untuk skenario BAGIAN 1.3 (recovery: unlock satu akun Leader)
 * dan kebutuhan administratif lain.
 * @param {number} id
 * @param {boolean} aktif
 */
async function updateAktif(id, aktif) {
  const pool = getPool();
  await pool.query(
    'UPDATE users SET aktif = :aktif WHERE id = :id',
    { id, aktif }
  );
}

/**
 * Menghitung jumlah akun LEADER yang aktif — dipakai untuk
 * rule BAGIAN 12 #2: "MINIMUM 2 LEADER AKTIF: Jika tinggal 1,
 * sistem warning + notifikasi ke Leader tersebut".
 * @returns {Promise<number>}
 */
async function countActiveLeaders() {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM users WHERE peran = 'LEADER' AND aktif = TRUE`
  );
  return Number(rows[0].total);
}

/**
 * Update password_hash user berdasarkan id.
 * @param {number} id
 * @param {string} passwordHash
 */
async function updatePassword(id, passwordHash) {
  const pool = getPool();
  await pool.query(
    'UPDATE users SET password_hash = :passwordHash WHERE id = :id',
    { id, passwordHash }
  );
}

/**
 * Ambil semua akun ADMIN (id, username, aktif, last_login_at) —
 * dipakai oleh endpoint list admin yang hanya bisa diakses LEADER.
 * @returns {Promise<Array<object>>}
 */
async function findAllAdmins() {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, username, aktif, last_login_at
     FROM users WHERE peran = 'ADMIN'
     ORDER BY username ASC`
  );
  return rows;
}

module.exports = {
  findByUsername,
  findById,
  createUser,
  updateLastLogin,
  updateAktif,
  updatePassword,
  findAllAdmins,
  countActiveLeaders,
};