const { getPool } = require('../../config/database');

async function upsert({ event_id, total_hadir, jemaat_baru = 0 }) {
  const pool = getPool();
  const [result] = await pool.query(
    `INSERT INTO event_kehadiran (event_id, total_hadir, jemaat_baru)
     VALUES (:event_id, :total_hadir, :jemaat_baru)
     ON DUPLICATE KEY UPDATE
       total_hadir = :total_hadir,
       jemaat_baru = :jemaat_baru`,
    { event_id, total_hadir, jemaat_baru }
  );
  return result.insertId || result.affectedRows;
}

async function findByEventId(eventId) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT * FROM event_kehadiran WHERE event_id = :eventId LIMIT 1',
    { eventId }
  );
  return rows[0] || null;
}

module.exports = { upsert, findByEventId };