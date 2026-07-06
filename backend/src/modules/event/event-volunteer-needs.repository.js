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

/**
 * Ambil seluruh kebutuhan kuota volunteer sebuah event, join ke
 * volunteer_jenis untuk nama, plus jumlah penugasan AKTIF per jenis
 * (untuk tampilan "terisi X dari kuota Y" di UI).
 * @param {number} eventId
 * @returns {Promise<Array<{ id, volunteer_type_id, nama_jenis, kuota, jumlah_terisi }>>}
 */
async function findByEventId(eventId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT evn.id, evn.volunteer_type_id, vj.nama AS nama_jenis, evn.kuota,
            COUNT(ev.id) AS jumlah_terisi
     FROM event_volunteer_needs evn
     JOIN volunteer_jenis vj ON evn.volunteer_type_id = vj.id
     LEFT JOIN event_volunteer ev
       ON ev.event_id = evn.event_id
      AND ev.jenis_id = evn.volunteer_type_id
      AND ev.status = 'AKTIF'
     WHERE evn.event_id = :eventId
     GROUP BY evn.id, evn.volunteer_type_id, vj.nama, evn.kuota
     ORDER BY vj.nama ASC`,
    { eventId }
  );
  return rows.map((row) => ({ ...row, jumlah_terisi: Number(row.jumlah_terisi) }));
}

/**
 * Ambil seluruh baris kebutuhan sebuah event dengan row lock
 * (SELECT ... FOR UPDATE), dipakai di dalam transaksi upsert
 * updateVolunteerNeeds agar tidak balapan dengan assignVolunteer
 * yang me-lock baris kuota yang sama.
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} eventId
 * @returns {Promise<Array<object>>}
 */
async function findByEventIdForUpdate(connection, eventId) {
  const [rows] = await connection.query(
    `SELECT * FROM event_volunteer_needs
     WHERE event_id = :eventId FOR UPDATE`,
    { eventId }
  );
  return rows;
}

/**
 * Insert-or-update kuota untuk kombinasi event + jenis (mengandalkan
 * UNIQUE KEY uq_evn_event_jenis), di dalam transaksi.
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {{ eventId: number, jenisId: number, kuota: number }} data
 */
async function upsertWithConnection(connection, { eventId, jenisId, kuota }) {
  await connection.query(
    `INSERT INTO event_volunteer_needs (event_id, volunteer_type_id, kuota)
     VALUES (:eventId, :jenisId, :kuota)
     ON DUPLICATE KEY UPDATE kuota = VALUES(kuota)`,
    { eventId, jenisId, kuota }
  );
}

/**
 * Hapus baris kebutuhan untuk kombinasi event + jenis, di dalam
 * transaksi (hapus baris = kembali ke perilaku tanpa batas kuota).
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} eventId
 * @param {number} jenisId
 */
async function deleteByEventAndJenisWithConnection(connection, eventId, jenisId) {
  await connection.query(
    `DELETE FROM event_volunteer_needs
     WHERE event_id = :eventId AND volunteer_type_id = :jenisId`,
    { eventId, jenisId }
  );
}

module.exports = {
  findByEventAndJenis,
  findByEventAndJenisForUpdate,
  findByEventId,
  findByEventIdForUpdate,
  upsertWithConnection,
  deleteByEventAndJenisWithConnection,
};
