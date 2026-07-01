const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const reportRepository = require('./report.repository');
const { recordAuditLog } = require('../auditlog/auditlog.repository');
const { decrypt } = require('../../utils/encryption.util');
const { getRedisClient } = require('../../config/redis');

const SYNC_THRESHOLD = 500; // record < 500 → sinkron
const REPORT_DIR = path.join(__dirname, '../../../uploads/reports');
const SIGNED_URL_TTL_SECONDS = 15 * 60; // 15 menit

function signedUrlKey(token) {
  return `signed_url:${token}`;
}

// Pastikan direktori report ada
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

/**
 * Generate nama file UUID acak.
 * Sesuai BAGIAN 7: nama UUID acak, tidak predictable.
 * @param {string} ext
 * @returns {string}
 */
function generateFileName(ext = 'json') {
  return `${crypto.randomUUID()}.${ext}`;
}

/**
 * Generate signed URL yang berlaku 15 menit, disimpan di Redis
 * (audit item 3 — persistent & shared antar instance).
 * Key: signed_url:{token} → JSON { fileName }, EX 900.
 * Sesuai BAGIAN 7: signed URL, auto-delete setelah 1x unduh atau 15 menit.
 * @param {string} fileName
 * @returns {Promise<string>} token
 */
async function generateSignedToken(fileName) {
  const token = crypto.randomUUID();
  const redis = getRedisClient();
  await redis.set(signedUrlKey(token), JSON.stringify({ fileName }), 'EX', SIGNED_URL_TTL_SECONDS);
  return token;
}

/**
 * Validasi dan konsumsi signed token (1x pakai) via Redis GETDEL —
 * atomik: ambil & hapus dalam satu operasi sehingga race minim.
 * Key yang tidak ada (expired/used/invalid) → null.
 * @param {string} token
 * @returns {Promise<{ fileName: string } | null>}
 */
async function consumeSignedToken(token) {
  const redis = getRedisClient();
  const raw = await redis.getdel(signedUrlKey(token));
  if (!raw) return null;
  try {
    const { fileName } = JSON.parse(raw);
    return { fileName };
  } catch {
    return null;
  }
}

/**
 * Dekripsi field sensitif per baris (streaming pattern).
 * Sesuai BAGIAN 7: streaming dekripsi, tidak buffer semua ke RAM.
 * @param {object} row
 * @returns {object}
 */
function dekripsiBarisJemaat(row) {
  const result = { ...row };
  try {
    if (row.no_hp && row.no_hp_iv) {
      result.no_hp = decrypt(row.no_hp, row.no_hp_iv);
    }
  } catch {
    result.no_hp = '[DECRYPT_ERROR]';
  }
  try {
    if (row.alamat && row.alamat_iv) {
      result.alamat = decrypt(row.alamat, row.alamat_iv);
    }
  } catch {
    result.alamat = '[DECRYPT_ERROR]';
  }
  // Hapus IV dari output
  delete result.no_hp_iv;
  delete result.alamat_iv;
  return result;
}

/**
 * Generate laporan data jemaat.
 * Jika record < 500: sinkron, return data langsung.
 * Jika record >= 500: async (simulasi queue), return token file.
 *
 * @param {{ includeSensitive?: boolean }} options
 * @param {{ actorUserId: number }} auth
 * @returns {Promise<{ data?, token?, async: boolean }>}
 */
async function generateJemaatReport({ includeSensitive = false } = {}, { actorUserId = null } = {}) {
  const total = await reportRepository.countJemaat();

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'EXPORT',
    modul: 'LAPORAN',
    objectId: null,
    dataSebelum: null,
    dataSesudah: { jenis: 'JEMAAT', total, includeSensitive },
  });

  if (total >= SYNC_THRESHOLD) {
    // Async: simpan ke file, return token
    const rows = await reportRepository.getJemaatReport({ limit: total });
    const processed = includeSensitive
      ? rows.map(dekripsiBarisJemaat)
      : rows.map((r) => {
          const { no_hp, no_hp_iv, alamat, alamat_iv, ...rest } = r;
          return rest;
        });

    const fileName = generateFileName('json');
    fs.writeFileSync(path.join(REPORT_DIR, fileName), JSON.stringify(processed));
    const token = await generateSignedToken(fileName);

    return { async: true, token, message: 'Laporan sedang diproses, gunakan token untuk mengunduh' };
  }

  // Sinkron: return data langsung
  const rows = await reportRepository.getJemaatReport({ limit: total });
  const data = includeSensitive
    ? rows.map(dekripsiBarisJemaat)
    : rows.map((r) => {
        const { no_hp, no_hp_iv, alamat, alamat_iv, ...rest } = r;
        return rest;
      });

  return { async: false, data };
}

/**
 * Generate laporan kehadiran event.
 * @param {{ eventId?, startDate?, endDate? }} filters
 * @param {{ actorUserId: number }} auth
 * @returns {Promise<{ data: Array<object>, async: false }>}
 */
async function generateEventReport(filters = {}, { actorUserId = null } = {}) {
  const rows = await reportRepository.getEventKehadiranReport(filters);

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'EXPORT',
    modul: 'LAPORAN',
    objectId: null,
    dataSebelum: null,
    dataSesudah: { jenis: 'KEHADIRAN_EVENT', filters },
  });

  return { async: false, data: rows };
}

/**
 * Generate laporan kehadiran CG.
 * @param {{ cgId?, jemaatId?, startDate?, endDate? }} filters
 * @param {{ actorUserId: number }} auth
 */
async function generateCGReport(filters = {}, { actorUserId = null } = {}) {
  const rows = await reportRepository.getCGKehadiranReport(filters);

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'EXPORT',
    modul: 'LAPORAN',
    objectId: null,
    dataSebelum: null,
    dataSesudah: { jenis: 'KEHADIRAN_CG', filters },
  });

  return { async: false, data: rows };
}

/**
 * Generate laporan volunteer.
 * @param {{ jemaatId?, eventId?, startDate?, endDate? }} filters
 * @param {{ actorUserId: number }} auth
 */
async function generateVolunteerReport(filters = {}, { actorUserId = null } = {}) {
  const rows = await reportRepository.getVolunteerReport(filters);

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'EXPORT',
    modul: 'LAPORAN',
    objectId: null,
    dataSebelum: null,
    dataSesudah: { jenis: 'VOLUNTEER', filters },
  });

  return { async: false, data: rows };
}

/**
 * Generate laporan analytics (tren pertumbuhan).
 * @param {{ bulan?: number }} options
 * @param {{ actorUserId: number }} auth
 */
async function generateAnalyticsReport({ bulan = 12 } = {}, { actorUserId = null } = {}) {
  const rows = await reportRepository.getAnalyticsReport({ bulan });

  await recordAuditLog({
    userId: actorUserId,
    aksi: 'EXPORT',
    modul: 'LAPORAN',
    objectId: null,
    dataSebelum: null,
    dataSesudah: { jenis: 'ANALYTICS', bulan },
  });

  return { async: false, data: rows };
}

/**
 * Download file laporan menggunakan signed token (1x pakai, 15 menit).
 * Sesuai BAGIAN 7: auto-delete setelah 1x unduh.
 * @param {string} token
 * @returns {Promise<{ filePath: string, fileName: string } | null>}
 */
async function downloadReport(token) {
  const entry = await consumeSignedToken(token);
  if (!entry) return null;

  const filePath = path.join(REPORT_DIR, entry.fileName);
  if (!fs.existsSync(filePath)) return null;

  return { filePath, fileName: entry.fileName };
}

module.exports = {
  generateJemaatReport,
  generateEventReport,
  generateCGReport,
  generateVolunteerReport,
  generateAnalyticsReport,
  downloadReport,
  generateSignedToken,
  consumeSignedToken,
  dekripsiBarisJemaat,
};