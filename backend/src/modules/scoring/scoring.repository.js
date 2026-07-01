const { getPool } = require('../../config/database');

/**
 * Ambil semua meeting CG dalam 3 bulan terakhir yang relevan
 * untuk seorang jemaat (semua CG yang pernah/masih diikuti).
 * Sesuai BAGIAN 6.1: multi-CG = TOTAL kehadiran / TOTAL meeting.
 *
 * @param {number} jemaatId
 * @param {Date} since - 3 bulan lalu
 * @returns {Promise<{ total_meeting: number, total_hadir: number }>}
 */
async function getCGAttendanceSummary(jemaatId, since) {
  const pool = getPool();

  // Total meeting CG dari semua CG yang pernah diikuti jemaat ini
  // dalam 3 bulan terakhir (left_at IS NULL atau left_at > since)
  const [meetingRows] = await pool.query(
    `SELECT COUNT(DISTINCT cm.id) AS total_meeting
     FROM cg_meeting cm
     JOIN cell_group_members cgm ON cm.cg_id = cgm.cg_id
     WHERE cgm.jemaat_id = :jemaatId
       AND cm.waktu_mulai >= :since
       AND (cgm.left_at IS NULL OR cgm.left_at > :since)`,
    { jemaatId, since }
  );

  // Total kehadiran jemaat di semua meeting CG tersebut
  const [hadirRows] = await pool.query(
    `SELECT COUNT(*) AS total_hadir
     FROM cg_absensi ca
     JOIN cg_meeting cm ON ca.meeting_id = cm.id
     JOIN cell_group_members cgm ON cm.cg_id = cgm.cg_id
     WHERE ca.jemaat_id = :jemaatId
       AND ca.hadir = TRUE
       AND cm.waktu_mulai >= :since
       AND cgm.jemaat_id = :jemaatId
       AND (cgm.left_at IS NULL OR cgm.left_at > :since)`,
    { jemaatId, since }
  );

  return {
    total_meeting: Number(meetingRows[0].total_meeting),
    total_hadir: Number(hadirRows[0].total_hadir),
  };
}

/**
 * Ambil semua event dalam 3 bulan terakhir (max 12 event referensi).
 * @param {Date} since
 * @returns {Promise<Array<{id: number}>>}
 */
async function getRecentEvents(since) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id FROM event
     WHERE waktu_mulai >= :since
       AND status IN ('AKTIF','SELESAI','DIARSIPKAN')
     ORDER BY waktu_mulai DESC
     LIMIT 12`,
    { since }
  );
  return rows;
}

/**
 * Ambil penugasan volunteer jemaat di event-event tertentu.
 * Mengambil status AKTIF dan BERTUGAS_PARSIAL beserta durasi_menit.
 * @param {number} jemaatId
 * @param {Array<number>} eventIds
 * @returns {Promise<Array<object>>}
 */
async function getVolunteerAssignments(jemaatId, eventIds) {
  if (!eventIds.length) return [];
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT event_id, status, durasi_menit
     FROM event_volunteer
     WHERE jemaat_id = :jemaatId
       AND event_id IN (:eventIds)
       AND status IN ('AKTIF','BERTUGAS_PARSIAL')`,
    { jemaatId, eventIds }
  );
  return rows;
}

/**
 * Ambil data attendance (hadir di event sebagai volunteer) dari
 * event_attendances — tabel yang diisi otomatis saat event AKTIF.
 * @param {number} jemaatId
 * @param {Array<number>} eventIds
 * @returns {Promise<Array<object>>}
 */
async function getEventAttendances(jemaatId, eventIds) {
  if (!eventIds.length) return [];
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT event_id FROM event_attendances
     WHERE jemaat_id = :jemaatId
       AND event_id IN (:eventIds)
       AND is_voided = FALSE`,
    { jemaatId, eventIds }
  );
  return rows;
}

/**
 * Cek apakah jemaat aktif di setidaknya satu CG.
 * Digunakan untuk update flag is_non_cg.
 * @param {number} jemaatId
 * @returns {Promise<boolean>}
 */
async function isActiveCGMember(jemaatId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM cell_group_members cgm
     JOIN cell_group cg ON cgm.cg_id = cg.id
     WHERE cgm.jemaat_id = :jemaatId
       AND cgm.left_at IS NULL
       AND cg.is_active = TRUE`,
    { jemaatId }
  );
  return Number(rows[0].cnt) > 0;
}

/**
 * Update skor keaktifan dan status keaktifan jemaat.
 * @param {number} jemaatId
 * @param {number} newSkor
 * @param {string} newStatus
 * @param {boolean} isNonCg
 */
async function updateSkor(jemaatId, newSkor, newStatus, isNonCg) {
  const pool = getPool();
  await pool.query(
    `UPDATE jemaat
     SET skor_keaktifan = :newSkor,
         status_keaktifan = :newStatus,
         is_non_cg = :isNonCg,
         updated_at = NOW()
     WHERE id = :jemaatId`,
    { jemaatId, newSkor, newStatus, isNonCg }
  );
}

/**
 * Ambil data jemaat yang perlu di-scoring:
 * - is_active = true
 * - deleted_at IS NULL
 * - is_new_member = false (grace period sudah selesai)
 * @returns {Promise<Array<object>>}
 */
async function getJemaatForScoring({ limit, offset } = {}) {
  const pool = getPool();

  // Tanpa limit → perilaku lama (ambil semua). Dengan limit/offset →
  // paginasi untuk pemrosesan per-chunk (audit item 6).
  if (limit === undefined || limit === null) {
    const [rows] = await pool.query(
      `SELECT id, skor_keaktifan, status_keaktifan, is_non_cg, is_new_member
       FROM jemaat
       WHERE is_active = TRUE
         AND deleted_at IS NULL
         AND is_new_member = FALSE`
    );
    return rows;
  }

  const [rows] = await pool.query(
    `SELECT id, skor_keaktifan, status_keaktifan, is_non_cg, is_new_member
     FROM jemaat
     WHERE is_active = TRUE
       AND deleted_at IS NULL
       AND is_new_member = FALSE
     ORDER BY id ASC
     LIMIT :limit OFFSET :offset`,
    { limit: Number(limit), offset: Number(offset) }
  );
  return rows;
}

module.exports = {
  getCGAttendanceSummary,
  getRecentEvents,
  getVolunteerAssignments,
  getEventAttendances,
  isActiveCGMember,
  updateSkor,
  getJemaatForScoring,
};