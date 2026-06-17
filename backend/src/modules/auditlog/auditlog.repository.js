const crypto = require('crypto');
const { getPool } = require('../../config/database');

/**
 * Menghitung HMAC SHA-256 sesuai formula BAGIAN 8.2:
 * message = id + user_id + aksi + modul + object_id +
 *           JSON.stringify(data_sebelum) + JSON.stringify(data_sesudah) +
 *           created_at.toISOString()
 *
 * Catatan: user_id dan object_id bisa null (BAGIAN 8.1: "nullable").
 * Nilai null digabungkan sebagai string kosong agar formula tetap
 * deterministik dan tidak menghasilkan literal "null" yang ambigu.
 */
function computeHmac({ id, userId, aksi, modul, objectId, dataSebelum, dataSesudah, createdAt }) {
  const secretKey = process.env.AUDIT_HMAC_SECRET;
  if (!secretKey) {
    throw new Error('AUDIT_HMAC_SECRET belum dikonfigurasi di environment');
  }

  const message =
    String(id) +
    String(userId ?? '') +
    String(aksi) +
    String(modul) +
    String(objectId ?? '') +
    JSON.stringify(dataSebelum ?? null) +
    JSON.stringify(dataSesudah ?? null) +
    createdAt.toISOString();

  return crypto.createHmac('sha256', secretKey).update(message).digest('hex');
}

/**
 * Mencatat satu entri audit log sesuai BAGIAN 8.1 & 8.2.
 *
 * Proses: INSERT baris terlebih dahulu (placeholder hmac_signature),
 * ambil id auto-increment, hitung HMAC menggunakan id tersebut,
 * lalu UPDATE kolom hmac_signature dengan nilai final.
 *
 * CATATAN OPERASIONAL (BAGIAN 8.3): UPDATE di sini adalah bagian
 * dari proses internal PENYELESAIAN satu baris log yang sedang
 * dibuat (melengkapi hmac_signature), BUKAN modifikasi log yang
 * sudah final. Privilege REVOKE UPDATE/DELETE untuk app_user
 * (BAGIAN 8.3) ditujukan mencegah tampering dari luar proses ini;
 * di environment produksi, koneksi yang menjalankan fungsi ini
 * harus memiliki privilege UPDATE terbatas hanya untuk pola ini,
 * atau proses ini dijalankan lewat service account terpisah.
 *
 * @param {object} params
 * @param {number|null} params.userId
 * @param {string} params.aksi
 * @param {string} params.modul
 * @param {number|null} params.objectId
 * @param {object|null} params.dataSebelum
 * @param {object|null} params.dataSesudah
 * @returns {Promise<number>} id baris audit log yang dibuat
 */
async function recordAuditLog({ userId = null, aksi, modul, objectId = null, dataSebelum = null, dataSesudah = null }) {
  const pool = getPool();
  // Bulatkan ke presisi detik (buang milidetik) supaya nilai yang
  // dipakai untuk hitung HMAC di sini PERSIS SAMA dengan nilai yang
  // akan terbaca kembali dari kolom TIMESTAMP TiDB (yang hanya
  // menyimpan presisi ke detik, tanpa fractional seconds). Tanpa
  // ini, HMAC yang dihitung saat INSERT tidak akan pernah cocok
  // lagi saat diverifikasi ulang setelah dibaca dari database.
  const now = new Date();
  const createdAt = new Date(Math.floor(now.getTime() / 1000) * 1000);

  const [insertResult] = await pool.query(
    `INSERT INTO audit_logs (user_id, aksi, modul, object_id, data_sebelum, data_sesudah, hmac_signature, created_at)
     VALUES (:userId, :aksi, :modul, :objectId, :dataSebelum, :dataSesudah, :placeholder, :createdAt)`,
    {
      userId,
      aksi,
      modul,
      objectId,
      dataSebelum: dataSebelum ? JSON.stringify(dataSebelum) : null,
      dataSesudah: dataSesudah ? JSON.stringify(dataSesudah) : null,
      placeholder: 'PENDING',
      createdAt,
    }
  );

  const id = insertResult.insertId;

  const hmacSignature = computeHmac({
    id,
    userId,
    aksi,
    modul,
    objectId,
    dataSebelum,
    dataSesudah,
    createdAt,
  });

  await pool.query(
    'UPDATE audit_logs SET hmac_signature = :hmacSignature WHERE id = :id',
    { hmacSignature, id }
  );

  return id;
}

/**
 * Mengambil satu entri audit log berdasarkan id, dan memverifikasi
 * apakah HMAC-nya masih cocok dengan data yang tersimpan saat ini
 * (BAGIAN 8.2 — deteksi tamper).
 *
 * @param {number} id
 * @returns {Promise<object|null>} entri log dengan tambahan field
 *   isTampered (boolean), atau null jika tidak ditemukan
 */
async function findByIdWithVerification(id) {
  const pool = getPool();
  const [rows] = await pool.query('SELECT * FROM audit_logs WHERE id = :id LIMIT 1', { id });
  const row = rows[0];
  if (!row) return null;

  // mysql2 secara otomatis mem-parse kolom bertipe JSON menjadi
  // object JavaScript, bukan string mentah — berbeda dari nilai
  // yang kita INSERT secara manual via JSON.stringify(). Jadi di
  // sini kita terima nilai apa adanya (sudah object) tanpa parse
  // ulang, dengan fallback untuk kasus nilai masih berupa string
  // (misal jika driver/versi database berbeda perilakunya).
  const dataSebelum =
    typeof row.data_sebelum === 'string'
      ? JSON.parse(row.data_sebelum)
      : (row.data_sebelum ?? null);
  const dataSesudah =
    typeof row.data_sesudah === 'string'
      ? JSON.parse(row.data_sesudah)
      : (row.data_sesudah ?? null);

  const recomputedHmac = computeHmac({
    id: row.id,
    userId: row.user_id,
    aksi: row.aksi,
    modul: row.modul,
    objectId: row.object_id,
    dataSebelum,
    dataSesudah,
    createdAt: new Date(row.created_at),
  });

  return {
    ...row,
    isTampered: recomputedHmac !== row.hmac_signature,
  };
}

module.exports = {
  computeHmac,
  recordAuditLog,
  findByIdWithVerification,
};