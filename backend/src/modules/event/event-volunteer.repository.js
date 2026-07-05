const { getPool } = require('../../config/database');
const { decryptOptional } = require('../../utils/encryption.util');

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
  // Nama jemaat (j.nama) tersimpan sebagai ciphertext (migration 005)
  // — dekripsi di level aplikasi memakai IV-nya.
  const [rows] = await pool.query(
    `SELECT ev.id, ev.jemaat_id, j.nama AS nama_jemaat, j.nama_iv AS nama_jemaat_iv,
            ev.jenis_id, vj.nama AS nama_jenis, ev.status,
            ev.replacement_timing, ev.replaced_by, ev.durasi_menit, ev.created_at
     FROM event_volunteer ev
     JOIN jemaat j ON ev.jemaat_id = j.id
     JOIN volunteer_jenis vj ON ev.jenis_id = vj.id
     WHERE ev.event_id = :eventId AND ev.status = 'AKTIF'`,
    { eventId }
  );
  return rows.map(({ nama_jemaat_iv, ...row }) => ({
    ...row,
    nama_jemaat: decryptOptional(row.nama_jemaat, nama_jemaat_iv),
  }));
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

/**
 * Versi transaksional dari updateStatus — memakai connection yang sudah
 * dibuka caller, agar update baris lama dan INSERT baris pengganti pada
 * replaceVolunteer ter-commit/rollback sebagai satu kesatuan.
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} id
 * @param {object} updates
 */
async function updateStatusWithConnection(connection, id, updates) {
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

  await connection.query(`UPDATE event_volunteer SET ${setClauses.join(', ')} WHERE id = :id`, params);
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

/**
 * Menugaskan volunteer memakai connection transaksi yang sudah dibuka
 * caller (dipakai bersama pessimistic lock di assignVolunteer agar
 * INSERT ini ikut ter-rollback bila kuota ternyata penuh).
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {{ event_id, jemaat_id, jenis_id }} data
 * @returns {Promise<number>} insertId
 */
async function assignWithConnection(connection, { event_id, jemaat_id, jenis_id }) {
  const [result] = await connection.query(
    `INSERT INTO event_volunteer (event_id, jemaat_id, jenis_id, status)
     VALUES (:event_id, :jemaat_id, :jenis_id, 'AKTIF')`,
    { event_id, jemaat_id, jenis_id }
  );
  return result.insertId;
}

/**
 * Menghitung jumlah penugasan AKTIF pada event + jenis tertentu,
 * dipakai untuk membandingkan dengan kuota di event_volunteer_needs.
 * Menerima executor (pool atau connection transaksi) agar bisa
 * dibaca konsisten di dalam transaksi yang sama dengan row lock kuota.
 *
 * Sengaja pakai FOR UPDATE walau hanya membaca (bukan mengubah)
 * event_volunteer: di dalam transaksi REPEATABLE READ, SELECT biasa
 * memakai snapshot dari awal transaksi (sebelum menunggu row lock
 * kuota terlepas), sehingga bisa membaca data basi (jumlah lama,
 * padahal transaksi lain barusan commit penugasan baru). FOR UPDATE
 * memaksa baca data ter-commit terbaru, konsisten dengan lock kuota.
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} executor
 * @param {number} eventId
 * @param {number} jenisId
 * @returns {Promise<number>}
 */
async function countActiveByEventAndJenis(executor, eventId, jenisId) {
  const [rows] = await executor.query(
    `SELECT COUNT(*) AS total FROM event_volunteer
     WHERE event_id = :eventId AND jenis_id = :jenisId AND status = 'AKTIF'
     FOR UPDATE`,
    { eventId, jenisId }
  );
  return Number(rows[0].total);
}

/**
 * Menghitung jumlah penugasan (event_volunteer) masing-masing jemaat
 * dalam 30 hari terakhir — dipakai untuk komponen S_frek pada
 * composite score Auto-Suggest Volunteer (BAB II §2.5.1).
 * @param {Array<number>} jemaatIds
 * @returns {Promise<Record<number, number>>} peta jemaat_id → jumlah tugas
 */
async function countTugas30HariBatch(jemaatIds) {
  if (!jemaatIds || jemaatIds.length === 0) return {};
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT jemaat_id, COUNT(*) AS total FROM event_volunteer
     WHERE jemaat_id IN (:jemaatIds) AND created_at >= NOW() - INTERVAL 30 DAY
     GROUP BY jemaat_id`,
    { jemaatIds }
  );
  const map = {};
  for (const row of rows) {
    map[row.jemaat_id] = Number(row.total);
  }
  return map;
}

/**
 * Mencari jemaat_id yang punya penugasan AKTIF pada event LAIN yang
 * waktunya tumpang tindih (overlap) dengan rentang waktu yang diberikan —
 * dipakai untuk pengecualian konflik jadwal pada Auto-Suggest Volunteer.
 * @param {{ waktuMulai, waktuSelesai, excludeEventId }} params
 * @returns {Promise<Array<number>>}
 */
async function findConflictingJemaatIds({ waktuMulai, waktuSelesai, excludeEventId }) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT DISTINCT ev.jemaat_id
     FROM event_volunteer ev
     JOIN event e ON ev.event_id = e.id
     WHERE ev.status = 'AKTIF'
       AND e.id != :excludeEventId
       AND e.waktu_mulai < :waktuSelesai AND e.waktu_selesai > :waktuMulai`,
    { waktuMulai, waktuSelesai, excludeEventId }
  );
  return rows.map((r) => r.jemaat_id);
}

module.exports = {
  assign,
  findActiveByEvent,
  findById,
  updateStatus,
  updateStatusWithConnection,
  findAssignedByJenis,
  assignWithConnection,
  countActiveByEventAndJenis,
  countTugas30HariBatch,
  findConflictingJemaatIds,
};