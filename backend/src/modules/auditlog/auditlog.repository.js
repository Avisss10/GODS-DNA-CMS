const crypto = require('crypto');
const { getPool } = require('../../config/database');

/**
 * Hitung HMAC SHA-256 untuk satu baris audit log.
 * Sesuai BAGIAN 8.2 dokumen.
 *
 * @param {{ id, userId, aksi, modul, objectId, dataSebelum, dataSesudah, createdAt }} params
 * @returns {string} hex string 64 karakter
 */
function computeHmac({ id, userId, aksi, modul, objectId, dataSebelum, dataSesudah, createdAt }) {
  const secretKey = process.env.AUDIT_HMAC_SECRET;
  if (!secretKey) {
    throw new Error('AUDIT_HMAC_SECRET belum dikonfigurasi di environment');
  }

  const message =
    String(id) +
    String(userId ?? '') +
    String(aksi ?? '') +
    String(modul ?? '') +
    String(objectId ?? '') +
    JSON.stringify(dataSebelum ?? null) +
    JSON.stringify(dataSesudah ?? null) +
    (createdAt instanceof Date ? createdAt.toISOString() : new Date(createdAt).toISOString());

  return crypto.createHmac('sha256', secretKey).update(message).digest('hex');
}

/**
 * Catat satu entri audit log (INSERT + UPDATE hmac_signature).
 * Append-only: tidak ada UPDATE atau DELETE.
 *
 * @param {{ userId, aksi, modul, objectId?, dataSebelum?, dataSesudah? }} params
 * @returns {Promise<number>} id baris yang baru dibuat
 */
async function recordAuditLog({ userId, aksi, modul, objectId = null, dataSebelum = null, dataSesudah = null }) {
  const pool = getPool();

  const dataSebelumJson = dataSebelum ? JSON.stringify(dataSebelum) : null;
  const dataSesudahJson = dataSesudah ? JSON.stringify(dataSesudah) : null;

  const [insertResult] = await pool.query(
    `INSERT INTO audit_logs
       (user_id, aksi, modul, object_id, data_sebelum, data_sesudah, hmac_signature, created_at)
     VALUES
       (:userId, :aksi, :modul, :objectId, :dataSebelum, :dataSesudah, '', NOW())`,
    { userId, aksi, modul, objectId, dataSebelum: dataSebelumJson, dataSesudah: dataSesudahJson }
  );

  const insertId = insertResult.insertId;

  // Ambil created_at yang baru di-INSERT untuk HMAC yang deterministik
  const [rows] = await pool.query(
    'SELECT created_at FROM audit_logs WHERE id = :id LIMIT 1',
    { id: insertId }
  );
  const createdAt = rows[0].created_at;

  const hmac = computeHmac({
    id: insertId,
    userId,
    aksi,
    modul,
    objectId,
    dataSebelum: dataSebelum ?? null,
    dataSesudah: dataSesudah ?? null,
    createdAt,
  });

  await pool.query(
    'UPDATE audit_logs SET hmac_signature = :hmac WHERE id = :id',
    { hmac, id: insertId }
  );

  return insertId;
}

/**
 * Ambil daftar audit log dengan filter opsional.
 * Hanya LEADER yang bisa memanggil ini (ditegakkan di layer route).
 *
 * @param {{ modul?, aksi?, userId?, objectId?, limit?, offset? }} filters
 * @returns {Promise<Array<object>>}
 */
async function findAll({ modul, aksi, userId, objectId, startDate, endDate, limit = 50, offset = 0 } = {}) {
  const pool = getPool();
  const conditions = [];
  const params = { limit: Number(limit), offset: Number(offset) };

  if (modul) { conditions.push('modul = :modul'); params.modul = modul; }
  if (aksi) { conditions.push('aksi = :aksi'); params.aksi = aksi; }
  if (userId) { conditions.push('user_id = :userId'); params.userId = Number(userId); }
  if (objectId) { conditions.push('object_id = :objectId'); params.objectId = Number(objectId); }
  if (startDate) { conditions.push('created_at >= :startDate'); params.startDate = startDate; }
  if (endDate) { conditions.push('created_at <= :endDate'); params.endDate = endDate; }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows] = await pool.query(
    `SELECT id, user_id, aksi, modul, object_id,
            data_sebelum, data_sesudah, hmac_signature, created_at
     FROM audit_logs
     ${where}
     ORDER BY created_at DESC
     LIMIT :limit OFFSET :offset`,
    params
  );
  return rows;
}

/**
 * Cari satu audit log by id.
 * @param {number} id
 * @returns {Promise<object|null>}
 */
async function findById(id) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, user_id, aksi, modul, object_id,
            data_sebelum, data_sesudah, hmac_signature, created_at
     FROM audit_logs WHERE id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

/**
 * Cari audit log by id dan verifikasi HMAC langsung di repository.
 * Digunakan oleh test lama dan integrasi tamper-detection.
 *
 * @param {number} id
 * @returns {Promise<object|null>}
 */
async function findByIdWithVerification(id) {
  const row = await findById(id);
  if (!row) return null;

  const secret = process.env.AUDIT_HMAC_SECRET;
  if (!secret) return { ...row, isTampered: true };

  const createdAt = row.created_at instanceof Date
    ? row.created_at.toISOString()
    : new Date(row.created_at).toISOString();

  const message =
    String(row.id) +
    String(row.user_id ?? '') +
    String(row.aksi ?? '') +
    String(row.modul ?? '') +
    String(row.object_id ?? '') +
    JSON.stringify(row.data_sebelum ?? null) +
    JSON.stringify(row.data_sesudah ?? null) +
    createdAt;

  const expected = crypto.createHmac('sha256', secret).update(message).digest('hex');

  return {
    ...row,
    isTampered: expected !== row.hmac_signature,
  };
}

module.exports = {
  computeHmac,
  recordAuditLog,
  findAll,
  findById,
  findByIdWithVerification,
};