const { getPool } = require('../../config/database');

/**
 * Ambil baris kebutuhan kuota volunteer untuk sebuah event + jenis
 * volunteer tertentu, tanpa lock (dipakai di luar transaksi).
 * @param {number} eventId
 * @param {number} jenisId
 * @returns {Promise<object|null>}
 */
async function findByEventAndJenis(eventId, jenisId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT * FROM event_volunteer_needs
     WHERE event_id = :eventId AND volunteer_type_id = :jenisId LIMIT 1`,
    { eventId, jenisId }
  );
  return rows[0] || null;
}

/**
 * Ambil baris kebutuhan kuota dengan row lock (SELECT ... FOR UPDATE),
 * dipakai di dalam transaksi assignVolunteer untuk mencegah race
 * condition saat dua request menugaskan volunteer ke kuota tersisa
 * terakhir secara bersamaan.
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} eventId
 * @param {number} jenisId
 * @returns {Promise<object|null>}
 */
async function findByEventAndJenisForUpdate(connection, eventId, jenisId) {
  const [rows] = await connection.query(
    `SELECT * FROM event_volunteer_needs
     WHERE event_id = :eventId AND volunteer_type_id = :jenisId LIMIT 1 FOR UPDATE`,
    { eventId, jenisId }
  );
  return rows[0] || null;
}

module.exports = { findByEventAndJenis, findByEventAndJenisForUpdate };
