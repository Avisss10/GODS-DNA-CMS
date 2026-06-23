const { getPool } = require('../../config/database');

/**
 * Insert satu baris event_attendances untuk seorang volunteer.
 * Dipanggil otomatis saat event berubah ke status AKTIF.
 * @param {{ event_id, jemaat_id }} data
 * @returns {Promise<number>} insertId
 */
async function insertAttendance({ event_id, jemaat_id }) {
  const pool = getPool();
  const [result] = await pool.query(
    `INSERT INTO event_attendances (event_id, jemaat_id, is_voided, created_at)
     VALUES (:event_id, :jemaat_id, FALSE, NOW())`,
    { event_id, jemaat_id }
  );
  return result.insertId;
}

/**
 * Insert batch event_attendances untuk semua volunteer aktif di event.
 * @param {number} eventId
 * @param {Array<number>} jemaatIds
 * @returns {Promise<void>}
 */
async function insertBatch(eventId, jemaatIds) {
  if (!jemaatIds.length) return;
  const pool = getPool();
  const values = jemaatIds.map((jId) => `(${eventId}, ${jId}, FALSE, NOW())`).join(', ');
  await pool.query(
    `INSERT INTO event_attendances (event_id, jemaat_id, is_voided, created_at)
     VALUES ${values}`
  );
}

/**
 * Ambil semua event_attendances aktif (tidak void) untuk seorang jemaat
 * dalam rentang waktu tertentu — digunakan untuk kalkulasi scoring event.
 * @param {number} jemaatId
 * @param {Date} since - 3 bulan lalu
 * @returns {Promise<Array<object>>}
 */
async function findActiveByJemaat(jemaatId, since) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT ea.id, ea.event_id, ea.created_at,
            e.waktu_mulai, e.waktu_selesai, e.status
     FROM event_attendances ea
     JOIN event e ON ea.event_id = e.id
     WHERE ea.jemaat_id = :jemaatId
       AND ea.is_voided = FALSE
       AND e.waktu_mulai >= :since
       AND e.status IN ('AKTIF','SELESAI','DIARSIPKAN')`,
    { jemaatId, since }
  );
  return rows;
}

/**
 * Cek apakah jemaat sudah punya attendance record untuk event ini.
 * @param {number} eventId
 * @param {number} jemaatId
 * @returns {Promise<object|null>}
 */
async function findByEventAndJemaat(eventId, jemaatId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT * FROM event_attendances
     WHERE event_id = :eventId AND jemaat_id = :jemaatId LIMIT 1`,
    { eventId, jemaatId }
  );
  return rows[0] || null;
}

module.exports = { insertAttendance, insertBatch, findActiveByJemaat, findByEventAndJemaat };