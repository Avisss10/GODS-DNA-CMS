const { getPool } = require('../../config/database');

/**
 * Buat notifikasi baru untuk satu atau beberapa user (Leader).
 * @param {{ userId: number, jenis: string, judul: string, pesan: string }} data
 * @returns {Promise<number>} insertId
 */
async function create({ userId, jenis, judul, pesan }) {
  const pool = getPool();
  const [result] = await pool.query(
    `INSERT INTO notifications (user_id, jenis, judul, pesan, is_read, created_at)
     VALUES (:userId, :jenis, :judul, :pesan, FALSE, NOW())`,
    { userId, jenis, judul, pesan }
  );
  return result.insertId;
}

/**
 * Ambil semua notifikasi milik seorang user, terbaru dulu.
 * @param {number} userId
 * @param {{ onlyUnread?: boolean, limit?: number }} options
 * @returns {Promise<Array<object>>}
 */
async function findByUser(userId, { onlyUnread = false, limit = 50 } = {}) {
  const pool = getPool();
  const params = { userId, limit };
  const extraWhere = onlyUnread ? 'AND is_read = FALSE' : '';

  const [rows] = await pool.query(
    `SELECT id, user_id, jenis, judul, pesan, is_read, created_at
     FROM notifications
     WHERE user_id = :userId ${extraWhere}
     ORDER BY created_at DESC
     LIMIT :limit`,
    params
  );
  return rows;
}

/**
 * Tandai satu notifikasi sebagai sudah dibaca.
 * @param {number} id
 * @param {number} userId - untuk verifikasi ownership
 * @returns {Promise<boolean>} true jika berhasil diupdate
 */
async function markAsRead(id, userId) {
  const pool = getPool();
  const [result] = await pool.query(
    `UPDATE notifications SET is_read = TRUE
     WHERE id = :id AND user_id = :userId`,
    { id, userId }
  );
  return result.affectedRows > 0;
}

/**
 * Tandai semua notifikasi milik user sebagai sudah dibaca.
 * @param {number} userId
 * @returns {Promise<number>} jumlah baris yang diupdate
 */
async function markAllAsRead(userId) {
  const pool = getPool();
  const [result] = await pool.query(
    `UPDATE notifications SET is_read = TRUE
     WHERE user_id = :userId AND is_read = FALSE`,
    { userId }
  );
  return result.affectedRows;
}

/**
 * Hitung notifikasi yang belum dibaca milik user.
 * @param {number} userId
 * @returns {Promise<number>}
 */
async function countUnread(userId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM notifications
     WHERE user_id = :userId AND is_read = FALSE`,
    { userId }
  );
  return Number(rows[0].total);
}

/**
 * Ambil semua user dengan peran LEADER yang aktif.
 * Digunakan untuk broadcast notifikasi ke semua Leader.
 * @returns {Promise<Array<{id: number, username: string}>>}
 */
async function findAllActiveLeaders() {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, username FROM users
     WHERE peran = 'LEADER' AND aktif = TRUE`
  );
  return rows;
}

module.exports = {
  create,
  findByUser,
  markAsRead,
  markAllAsRead,
  countUnread,
  findAllActiveLeaders,
};