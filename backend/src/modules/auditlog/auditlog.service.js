const crypto = require('crypto');
const auditlogRepository = require('./auditlog.repository');

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

  return rows.map((row) => {
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
    getAuditLogById
};