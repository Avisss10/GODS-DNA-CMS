const { getPool } = require('../../config/database');

/**
 * Ambil semua jemaat aktif beserta skor untuk laporan.
 * Data sensitif (no_hp, alamat) dikembalikan dalam bentuk
 * ciphertext — dekripsi dilakukan di service (streaming).
 * @param {{ limit?, offset? }} options
 * @returns {Promise<Array<object>>}
 */
async function getJemaatReport({ limit = 500, offset = 0 } = {}) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, nama, tgl_lahir, jenis_kelamin,
            no_hp, no_hp_iv, alamat, alamat_iv,
            tgl_bergabung, is_active, is_new_member,
            skor_keaktifan, status_keaktifan, created_at
     FROM jemaat
     WHERE is_active = TRUE AND deleted_at IS NULL
     ORDER BY nama ASC
     LIMIT :limit OFFSET :offset`,
    { limit, offset }
  );
  return rows;
}

/**
 * Hitung total jemaat aktif untuk paginasi.
 * @returns {Promise<number>}
 */
async function countJemaat() {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS total FROM jemaat WHERE is_active = TRUE AND deleted_at IS NULL'
  );
  return Number(rows[0].total);
}

/**
 * Ambil data kehadiran event dalam rentang tanggal.
 * @param {{ eventId?, startDate?, endDate?, limit?, offset? }} options
 * @returns {Promise<Array<object>>}
 */
async function getEventKehadiranReport({ eventId, startDate, endDate, limit = 500, offset = 0 } = {}) {
  const pool = getPool();
  const conditions = ["e.status IN ('SELESAI','DIARSIPKAN')"];
  const params = { limit, offset };

  if (eventId) { conditions.push('e.id = :eventId'); params.eventId = Number(eventId); }
  if (startDate) { conditions.push('e.waktu_mulai >= :startDate'); params.startDate = startDate; }
  if (endDate) { conditions.push('e.waktu_mulai <= :endDate'); params.endDate = endDate; }

  const [rows] = await pool.query(
    `SELECT e.id AS event_id, e.judul, e.jenis, e.waktu_mulai, e.waktu_selesai,
            ek.total_hadir, ek.jemaat_baru,
            COUNT(ev.id) AS total_volunteer
     FROM event e
     LEFT JOIN event_kehadiran ek ON e.id = ek.event_id
     LEFT JOIN event_volunteer ev ON e.id = ev.event_id AND ev.status = 'AKTIF'
     WHERE ${conditions.join(' AND ')}
     GROUP BY e.id, e.judul, e.jenis, e.waktu_mulai, e.waktu_selesai,
              ek.total_hadir, ek.jemaat_baru
     ORDER BY e.waktu_mulai DESC
     LIMIT :limit OFFSET :offset`,
    params
  );
  return rows;
}

/**
 * Ambil data kehadiran CG per jemaat atau per CG.
 * @param {{ cgId?, jemaatId?, startDate?, endDate?, limit?, offset? }} options
 * @returns {Promise<Array<object>>}
 */
async function getCGKehadiranReport({ cgId, jemaatId, startDate, endDate, limit = 500, offset = 0 } = {}) {
  const pool = getPool();
  const conditions = [];
  const params = { limit, offset };

  if (cgId) { conditions.push('cm.cg_id = :cgId'); params.cgId = Number(cgId); }
  if (jemaatId) { conditions.push('ca.jemaat_id = :jemaatId'); params.jemaatId = Number(jemaatId); }
  if (startDate) { conditions.push('cm.waktu_mulai >= :startDate'); params.startDate = startDate; }
  if (endDate) { conditions.push('cm.waktu_mulai <= :endDate'); params.endDate = endDate; }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT cg.nama AS nama_cg, cm.id AS meeting_id, cm.judul,
            cm.jenis, cm.waktu_mulai,
            j.nama AS nama_jemaat, ca.hadir
     FROM cg_absensi ca
     JOIN cg_meeting cm ON ca.meeting_id = cm.id
     JOIN cell_group cg ON cm.cg_id = cg.id
     JOIN jemaat j ON ca.jemaat_id = j.id
     ${where}
     ORDER BY cm.waktu_mulai DESC
     LIMIT :limit OFFSET :offset`,
    params
  );
  return rows;
}

/**
 * Ambil riwayat penugasan volunteer.
 * @param {{ jemaatId?, eventId?, startDate?, endDate?, limit?, offset? }} options
 * @returns {Promise<Array<object>>}
 */
async function getVolunteerReport({ jemaatId, eventId, startDate, endDate, limit = 500, offset = 0 } = {}) {
  const pool = getPool();
  const conditions = [];
  const params = { limit, offset };

  if (jemaatId) { conditions.push('ev.jemaat_id = :jemaatId'); params.jemaatId = Number(jemaatId); }
  if (eventId) { conditions.push('ev.event_id = :eventId'); params.eventId = Number(eventId); }
  if (startDate) { conditions.push('e.waktu_mulai >= :startDate'); params.startDate = startDate; }
  if (endDate) { conditions.push('e.waktu_mulai <= :endDate'); params.endDate = endDate; }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT j.nama AS nama_jemaat, e.judul AS nama_event,
            e.waktu_mulai, vj.nama AS jenis_volunteer,
            ev.status, ev.durasi_menit, ev.created_at
     FROM event_volunteer ev
     JOIN jemaat j ON ev.jemaat_id = j.id
     JOIN event e ON ev.event_id = e.id
     JOIN volunteer_jenis vj ON ev.jenis_id = vj.id
     ${where}
     ORDER BY e.waktu_mulai DESC
     LIMIT :limit OFFSET :offset`,
    params
  );
  return rows;
}

/**
 * Ambil data analytics: tren pertumbuhan jemaat per bulan.
 * @param {{ bulan? }} options - jumlah bulan ke belakang (default 12)
 * @returns {Promise<Array<object>>}
 */
async function getAnalyticsReport({ bulan = 12 } = {}) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT
       DATE_FORMAT(tgl_bergabung, '%Y-%m') AS periode,
       COUNT(*) AS jemaat_baru,
       SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) AS masih_aktif
     FROM jemaat
     WHERE tgl_bergabung >= DATE_SUB(NOW(), INTERVAL :bulan MONTH)
       AND deleted_at IS NULL
     GROUP BY DATE_FORMAT(tgl_bergabung, '%Y-%m')
     ORDER BY periode ASC`,
    { bulan }
  );
  return rows;
}

module.exports = {
  getJemaatReport,
  countJemaat,
  getEventKehadiranReport,
  getCGKehadiranReport,
  getVolunteerReport,
  getAnalyticsReport,
};