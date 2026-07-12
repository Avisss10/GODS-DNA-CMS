require('dotenv').config();

const { getPool } = require('../../../config/database');
const auditlogRepository = require('../../../modules/auditlog/auditlog.repository');

const NOW = new Date();
const START_DATE = addDays(NOW, -730); // ~2 tahun lalu

function pad2(n) {
  return String(n).padStart(2, '0');
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function daysAgo(n) {
  return addDays(NOW, -n);
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randomFloat(min, max) {
  return min + Math.random() * (max - min);
}

function pick(arr, i) {
  return arr[((i % arr.length) + arr.length) % arr.length];
}

function pickRandom(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function chance(probability) {
  return Math.random() < probability;
}

/**
 * Tanggal acak di antara dua Date (inklusif), dengan jam-menit acak
 * (bukan selalu tengah malam) supaya terasa lebih natural.
 */
function randomDateBetween(start, end) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const ms = startMs + Math.random() * (endMs - startMs);
  const d = new Date(ms);
  d.setHours(randomInt(6, 21), randomInt(0, 59), randomInt(0, 59), 0);
  return d;
}

/** Format DATE murni (YYYY-MM-DD) untuk kolom seperti tgl_bergabung/tgl_lahir. */
function formatDateOnly(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Format DATETIME (YYYY-MM-DD HH:MM:SS) untuk kolom seperti waktu_mulai/created_at. */
function formatDateTime(date) {
  return `${formatDateOnly(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

// ── Engagement profile: dipakai untuk membentuk pola kehadiran/partisipasi
// per-jemaat yang konsisten (bukan murni acak tiap event), supaya hasil
// akhir scoring (skor_keaktifan) tersebar realistis antar AKTIF/KURANG_AKTIF/
// TIDAK_AKTIF alih-alih random noise.
const ENGAGEMENT_PROFILES = {
  tinggi: { weight: 0.30, attendanceProb: 0.88, recentAttendanceProb: 0.90 },
  sedang: { weight: 0.45, attendanceProb: 0.55, recentAttendanceProb: 0.55 },
  rendah: { weight: 0.25, attendanceProb: 0.22, recentAttendanceProb: 0.15 },
};
// Rate flat untuk histori di luar window scoring (>3 bulan lalu) — tidak
// pernah dipakai scoring.service, jadi tidak perlu presisi per-profil.
const FLAT_HISTORICAL_ATTENDANCE_PROB = 0.65;

function assignEngagementProfile() {
  const r = Math.random();
  let cumulative = 0;
  for (const [name, cfg] of Object.entries(ENGAGEMENT_PROFILES)) {
    cumulative += cfg.weight;
    if (r <= cumulative) return name;
  }
  return 'sedang';
}

// Window scoring nyata (scoring.service.hitungSkorJemaat): NOW - 3 bulan.
const SCORING_WINDOW_START = (() => {
  const d = new Date(NOW);
  d.setMonth(d.getMonth() - 3);
  return d;
})();

/**
 * Probabilitas hadir untuk sebuah jemaat pada tanggal tertentu:
 * flat untuk histori lama, mengikuti profil keaktifan untuk 3 bulan
 * terakhir (satu-satunya window yang benar-benar dipakai scoring).
 */
function attendanceProbabilityFor(profileName, date) {
  if (date < SCORING_WINDOW_START) return FLAT_HISTORICAL_ATTENDANCE_PROB;
  return ENGAGEMENT_PROFILES[profileName].recentAttendanceProb;
}

/**
 * UPDATE langsung satu kolom timestamp sebuah baris (backdate).
 * Dipakai untuk created_at/joined_at/uploaded_at yang selalu
 * DEFAULT CURRENT_TIMESTAMP di schema dan tidak settable lewat
 * repository/service manapun.
 */
async function backdate(table, id, date, column = 'created_at') {
  const pool = getPool();
  await pool.query(
    `UPDATE \`${table}\` SET \`${column}\` = :date WHERE id = :id`,
    { date: formatDateTime(date), id }
  );
}

// withHistoricalDate identifies "which audit_logs rows were just created"
// by snapshotting MAX(id) before/after fn() runs. That's only correct if
// no OTHER withHistoricalDate call's fn() can insert audit rows in the
// same window — otherwise two concurrent chains (e.g. mapLimit over CGs
// or events) would each try to backdate/re-sign rows belonging to the
// OTHER chain, corrupting both. A single global FIFO lock serializes the
// snapshot+fn()+backdate critical section app-wide so callers can still
// use mapLimit for the surrounding (non-audited) work without risking
// audit_logs corruption.
let auditLockTail = Promise.resolve();
function withGlobalAuditLock(criticalSection) {
  const runPromise = auditLockTail.then(criticalSection, criticalSection);
  auditLockTail = runPromise.then(() => {}, () => {});
  return runPromise;
}

/**
 * Jalankan sebuah operasi service-layer (yang mungkin merekam 1+ baris
 * audit_logs lewat recordAuditLog dengan created_at=NOW()), lalu:
 *   1. Backdate audit_logs yang baru dibuat ke `date`.
 *   2. Hitung ulang hmac_signature memakai created_at baru tsb —
 *      WAJIB, karena hmac_signature dihitung dari created_at asli.
 *      Tanpa ini, auditlog.service.verifyHmac() akan menandai baris
 *      ini POTENTIALLY_TAMPERED.
 *
 * @param {Date} date - tanggal historis yang diinginkan
 * @param {() => Promise<any>} fn - operasi yang dijalankan (service call)
 * @returns {Promise<any>} hasil fn()
 */
async function withHistoricalDate(date, fn) {
  // The `created_at` column is a TIMESTAMP (whole-second precision), but a
  // JS Date carries milliseconds. If we sign with the raw `date` (often
  // non-zero ms, inherited from addDays()/daysAgo() chains off the
  // module-load NOW()) while storing the second-truncated string, a later
  // read-back of created_at (always .000 ms) would recompute a DIFFERENT
  // HMAC than the one we stored here — a self-inflicted "tampered" flag.
  // Truncating up front keeps the signed value and the stored value identical.
  const truncatedDate = new Date(date);
  truncatedDate.setMilliseconds(0);

  return withGlobalAuditLock(async () => {
    const pool = getPool();

    const [[beforeRow]] = await pool.query('SELECT COALESCE(MAX(id), 0) AS maxId FROM audit_logs');
    const beforeId = beforeRow.maxId;

    const result = await fn();

    const [[afterRow]] = await pool.query('SELECT COALESCE(MAX(id), 0) AS maxId FROM audit_logs');
    const afterId = afterRow.maxId;

    if (afterId > beforeId) {
      const [rows] = await pool.query(
        'SELECT * FROM audit_logs WHERE id > :beforeId AND id <= :afterId',
        { beforeId, afterId }
      );

      for (const row of rows) {
        const dataSebelum = typeof row.data_sebelum === 'string' ? JSON.parse(row.data_sebelum) : row.data_sebelum;
        const dataSesudah = typeof row.data_sesudah === 'string' ? JSON.parse(row.data_sesudah) : row.data_sesudah;

        const hmac = auditlogRepository.computeHmac({
          id: row.id,
          userId: row.user_id,
          aksi: row.aksi,
          modul: row.modul,
          objectId: row.object_id,
          dataSebelum,
          dataSesudah,
          createdAt: truncatedDate,
        });

        await pool.query(
          'UPDATE audit_logs SET created_at = :date, hmac_signature = :hmac WHERE id = :id',
          { date: formatDateTime(truncatedDate), hmac, id: row.id }
        );
      }
    }

    return result;
  });
}

/**
 * Insert baris audit_logs langsung dengan created_at historis (tanpa
 * melalui recordAuditLog yang selalu pakai NOW()) — dipakai untuk
 * histori sintetis (LOGIN/LOGOUT/EXPORT) yang tidak punya operasi
 * service nyata untuk "dibungkus" withHistoricalDate.
 */
async function insertHistoricalAuditLog({ userId, aksi, modul, objectId = null, dataSebelum = null, dataSesudah = null, date }) {
  const pool = getPool();
  const truncatedDate = new Date(date);
  truncatedDate.setMilliseconds(0); // lihat komentar di withHistoricalDate — created_at hanya presisi detik
  const dataSebelumJson = dataSebelum ? JSON.stringify(dataSebelum) : null;
  const dataSesudahJson = dataSesudah ? JSON.stringify(dataSesudah) : null;
  const createdAtStr = formatDateTime(truncatedDate);

  const [insertResult] = await pool.query(
    `INSERT INTO audit_logs (user_id, aksi, modul, object_id, data_sebelum, data_sesudah, hmac_signature, created_at)
     VALUES (:userId, :aksi, :modul, :objectId, :dataSebelum, :dataSesudah, '', :createdAt)`,
    { userId, aksi, modul, objectId, dataSebelum: dataSebelumJson, dataSesudah: dataSesudahJson, createdAt: createdAtStr }
  );

  const id = insertResult.insertId;
  const hmac = auditlogRepository.computeHmac({
    id,
    userId,
    aksi,
    modul,
    objectId,
    dataSebelum: dataSebelum ?? null,
    dataSesudah: dataSesudah ?? null,
    createdAt: truncatedDate,
  });

  await pool.query('UPDATE audit_logs SET hmac_signature = :hmac WHERE id = :id', { hmac, id });
  return id;
}

/**
 * Jalankan `items` lewat `worker` dengan concurrency terbatas — chain
 * independen (per cell group / per event) tidak perlu dieksekusi
 * sequential murni, ini menekan total wall-time terhadap DB remote.
 */
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runNext() {
    while (cursor < items.length) {
      const current = cursor++;
      results[current] = await worker(items[current], current);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, runNext);
  await Promise.all(runners);
  return results;
}

module.exports = {
  NOW,
  START_DATE,
  SCORING_WINDOW_START,
  addDays,
  daysAgo,
  randomInt,
  randomFloat,
  pick,
  pickRandom,
  chance,
  randomDateBetween,
  formatDateOnly,
  formatDateTime,
  assignEngagementProfile,
  attendanceProbabilityFor,
  ENGAGEMENT_PROFILES,
  FLAT_HISTORICAL_ATTENDANCE_PROB,
  backdate,
  withHistoricalDate,
  insertHistoricalAuditLog,
  mapLimit,
};
