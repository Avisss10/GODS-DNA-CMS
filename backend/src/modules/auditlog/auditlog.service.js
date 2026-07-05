const crypto = require('crypto');
const auditlogRepository = require('./auditlog.repository');
const { getRedisClient } = require('../../config/redis');
const { notifyLeaders } = require('../notification/notification.stub');

// Dedup notifikasi tamper per baris audit log: 1x per 24 jam,
// supaya membuka halaman audit log berulang tidak membanjiri Leader.
const TAMPER_NOTIFIED_TTL_SECONDS = 24 * 60 * 60;

function tamperNotifiedKey(auditLogId) {
  return `tamper_notified:${auditLogId}`;
}

/**
 * Kirim notifikasi AUDIT_TAMPERED untuk satu baris yang HMAC-nya tidak
 * cocok, dengan deduplikasi via Redis (SET NX EX — atomik).
 *
 * Hanya untuk status POTENTIALLY_TAMPERED; NO_SECRET (env belum diset)
 * adalah masalah konfigurasi, bukan indikasi manipulasi data.
 *
 * Kegagalan apa pun di sini (Redis/notifikasi) ditelan dengan log —
 * endpoint baca audit log TIDAK boleh ikut error.
 *
 * @param {number} auditLogId
 */
async function notifyTamperedRow(auditLogId) {
  try {
    const redis = getRedisClient();
    const firstTime = await redis.set(
      tamperNotifiedKey(auditLogId), '1', 'EX', TAMPER_NOTIFIED_TTL_SECONDS, 'NX'
    );
    if (firstTime !== 'OK') return; // sudah dinotifikasi dalam 24 jam terakhir

    await notifyLeaders({
      jenis: 'AUDIT_TAMPERED',
      pesan: `Verifikasi HMAC gagal untuk audit log id=${auditLogId} — baris ini terindikasi dimanipulasi. Segera periksa integritas database.`,
      meta: { auditLogId },
    });
  } catch (err) {
    console.error(`notifyTamperedRow gagal untuk audit log ${auditLogId}:`, err.message);
  }
}

/**
 * Verifikasi HMAC satu baris audit log.
 * Sesuai BAGIAN 8.2: hitung ulang HMAC dari data baris,
 * bandingkan dengan hmac_signature yang tersimpan.
 *
 * Formula HMAC:
 *   message = id + user_id + aksi + modul + object_id +
 *             JSON.stringify(data_sebelum) +
 *             JSON.stringify(data_sesudah) +
 *             created_at.toISOString()
 *
 * @param {object} row - baris audit log dari database
 * @returns {{ valid: boolean, status: string }}
 */
function verifyHmac(row) {
  const secret = process.env.AUDIT_HMAC_SECRET;
  if (!secret) return { valid: false, status: 'NO_SECRET' };

  const createdAt = row.created_at instanceof Date
    ? row.created_at.toISOString()
    : new Date(row.created_at).toISOString();

  const message = [
    String(row.id),
    String(row.user_id ?? ''),
    String(row.aksi ?? ''),
    String(row.modul ?? ''),
    String(row.object_id ?? ''),
    JSON.stringify(row.data_sebelum ?? null),
    JSON.stringify(row.data_sesudah ?? null),
    createdAt,
  ].join('');

  const expected = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');

  const valid = expected === row.hmac_signature;
  return {
    valid,
    status: valid ? 'OK' : 'POTENTIALLY_TAMPERED',
  };
}

/**
 * Ambil daftar audit log + verifikasi HMAC setiap baris.
 * Sesuai BAGIAN 8.2: Leader bisa baca dan verifikasi integritas.
 *
 * @param {{ modul?, aksi?, userId?, objectId?, limit?, offset? }} filters
 * @returns {Promise<Array<object>>}
 */
async function listAuditLogs(filters = {}) {
  const rows = await auditlogRepository.findAll(filters);

  const result = rows.map((row) => {
    const { valid, status } = verifyHmac(row);
    return {
      ...row,
      data_sebelum: row.data_sebelum
        ? (typeof row.data_sebelum === 'string'
            ? JSON.parse(row.data_sebelum)
            : row.data_sebelum)
        : null,
      data_sesudah: row.data_sesudah
        ? (typeof row.data_sesudah === 'string'
            ? JSON.parse(row.data_sesudah)
            : row.data_sesudah)
        : null,
      hmac_valid: valid,
      hmac_status: status,
    };
  });

  // Notifikasi tamper untuk baris yang rusak (dedup 24 jam per baris)
  for (const row of result) {
    if (row.hmac_status === 'POTENTIALLY_TAMPERED') {
      await notifyTamperedRow(row.id);
    }
  }

  return result;
}

/**
 * Ambil satu audit log by id + verifikasi HMAC.
 * @param {number} id
 * @returns {Promise<object|null>}
 */
async function getAuditLogById(id) {
  const row = await auditlogRepository.findById(id);
  if (!row) return null;

  const { valid, status } = verifyHmac(row);

  if (status === 'POTENTIALLY_TAMPERED') {
    await notifyTamperedRow(row.id);
  }

  return {
    ...row,
    data_sebelum: row.data_sebelum
      ? (typeof row.data_sebelum === 'string'
          ? JSON.parse(row.data_sebelum)
          : row.data_sebelum)
      : null,
    data_sesudah: row.data_sesudah
      ? (typeof row.data_sesudah === 'string'
          ? JSON.parse(row.data_sesudah)
          : row.data_sesudah)
      : null,
    hmac_valid: valid,
    hmac_status: status,
  };
}

module.exports = {
    verifyHmac,
    listAuditLogs,
    getAuditLogById,
    notifyTamperedRow,
    tamperNotifiedKey,
    TAMPER_NOTIFIED_TTL_SECONDS,
};