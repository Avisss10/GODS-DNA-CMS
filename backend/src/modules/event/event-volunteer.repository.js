const { getPool } = require('../../config/database');

async function assign({ event_id, jemaat_id, jenis_id }) {
  const pool = getPool();
  const [result] = await pool.query(
    `INSERT INTO event_volunteer (event_id, jemaat_id, jenis_id, status)
     VALUES (:event_id, :jemaat_id, :jenis_id, 'AKTIF')`,
    { event_id, jemaat_id, jenis_id }
  );
  return result.insertId;
}

async function findActiveByEvent(eventId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT ev.id, ev.jemaat_id, j.nama AS nama_jemaat,
            ev.jenis_id, vj.nama AS nama_jenis, ev.status,
            ev.replacement_timing, ev.replaced_by, ev.durasi_menit, ev.created_at
     FROM event_volunteer ev
     JOIN jemaat j ON ev.jemaat_id = j.id
     JOIN volunteer_jenis vj ON ev.jenis_id = vj.id
     WHERE ev.event_id = :eventId AND ev.status = 'AKTIF'`,
    { eventId }
  );
  return rows;
}

async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT * FROM event_volunteer WHERE id = :id LIMIT 1',
    { id }
  );
  return rows[0] || null;
}

async function updateStatus(id, updates) {
  const pool = getPool();
  const allowed = ['status', 'replacement_timing', 'replaced_by', 'alasan', 'durasi_menit'];
  const setClauses = [];
  const params = { id };

  for (const key of allowed) {
    if (updates[key] !== undefined) {
      setClauses.push(`${key} = :${key}`);
      params[key] = updates[key];
    }
  }

  if (setClauses.length === 0) return;

  await pool.query(`UPDATE event_volunteer SET ${setClauses.join(', ')} WHERE id = :id`, params);
}

async function findAssignedByJenis(eventId, jenisId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT jemaat_id FROM event_volunteer
     WHERE event_id = :eventId AND jenis_id = :jenisId AND status = 'AKTIF'`,
    { eventId, jenisId }
  );
  return rows;
}

module.exports = { assign, findActiveByEvent, findById, updateStatus, findAssignedByJenis };