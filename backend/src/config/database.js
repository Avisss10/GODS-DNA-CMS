const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

let pool = null;

/**
 * Membangun opsi SSL untuk koneksi TLS ke TiDB Cloud.
 * Mengembalikan undefined jika DB_SSL_CA_PATH tidak diset —
 * memungkinkan koneksi non-TLS untuk dev lokal (misal MySQL biasa).
 *
 * Path di DB_SSL_CA_PATH bersifat relatif terhadap root folder
 * backend (cwd saat npm script dijalankan), sesuai konvensi .env.
 */
function buildSslOptions() {
  const caPath = process.env.DB_SSL_CA_PATH;

  if (!caPath) {
    return undefined;
  }

  const resolvedPath = path.isAbsolute(caPath)
    ? caPath
    : path.join(process.cwd(), caPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `DB_SSL_CA_PATH diset ke "${caPath}" tapi file tidak ditemukan di "${resolvedPath}". ` +
      `Pastikan ca.pem sudah diunduh dari dashboard TiDB Cloud (Connect > Public > CA cert) ` +
      `dan ditaruh di path tersebut.`
    );
  }

  return {
    ca: fs.readFileSync(resolvedPath, 'utf-8'),
    minVersion: 'TLSv1.2',
  };
}

const RETRYABLE_ERROR_CODES = new Set(['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT', 'ECONNREFUSED']);

function isRetryableConnectionError(err) {
  return !!err && (RETRYABLE_ERROR_CODES.has(err.code) || err.fatal === true);
}

/**
 * TiDB Cloud (atau load balancer di depannya) bisa diam-diam memutus
 * koneksi yang lagi idle di pool. Tanpa ini, query berikutnya yang
 * kebetulan dapat koneksi basi itu langsung gagal ECONNRESET dan
 * dilempar sebagai 500 ke user — padahal cukup dicoba ulang sekali
 * lewat koneksi baru dari pool. Dipasang di sini (pusat) supaya semua
 * modul yang sudah pakai pool.query(...) otomatis terlindungi tanpa
 * perlu diubah satu-satu.
 *
 * SENGAJA tidak membungkus connection.query() (dipakai transaksi lewat
 * pool.getConnection()) — retry di tengah transaksi berisiko korupsi
 * state, lebih aman biarkan gagal apa adanya di sana.
 */
function wrapPoolQueryWithRetry(targetPool) {
  const originalQuery = targetPool.query.bind(targetPool);
  targetPool.query = async function queryWithRetry(...args) {
    try {
      return await originalQuery(...args);
    } catch (err) {
      if (!isRetryableConnectionError(err)) {
        throw err;
      }
      console.warn(`[DB] Query gagal (${err.code || 'fatal'}), mencoba ulang sekali lewat koneksi baru...`);
      return originalQuery(...args);
    }
  };
  return targetPool;
}

/**
 * Membuat (atau mengembalikan) connection pool tunggal (singleton)
 * untuk seluruh aplikasi. Pool dibuat lazy — baru terbentuk saat
 * pertama kali dipanggil, bukan saat file ini di-require.
 */
function getPool() {
  if (pool) {
    return pool;
  }

  const sslOptions = buildSslOptions();

  pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 4000,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
    queueLimit: 0,
    namedPlaceholders: true,
    connectTimeout: 10000,
    // TCP keepalive supaya koneksi idle di pool tidak diam-diam
    // dianggap mati oleh load balancer/TiDB Cloud sebelum dipakai lagi.
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    ...(sslOptions ? { ssl: sslOptions } : {}),
  });

  // Tanpa listener ini, error latar-belakang pool (bukan dari query yang
  // sedang berjalan, mis. koneksi idle diputus server) tidak tercatat
  // sama sekali sampai request berikutnya kebetulan kena koneksi itu.
  pool.on('error', (err) => {
    console.error('[DB] Pool error:', err.code || err.message);
  });

  wrapPoolQueryWithRetry(pool);

  return pool;
}

/**
 * Memverifikasi pool benar-benar bisa terhubung ke TiDB dengan
 * menjalankan query trivial (SELECT 1).
 */
async function testConnection() {
  const currentPool = getPool();
  const connection = await currentPool.getConnection();
  try {
    await connection.query('SELECT 1');
    return true;
  } finally {
    connection.release();
  }
}

/**
 * Menutup pool secara graceful.
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  getPool,
  testConnection,
  closePool,
  buildSslOptions, // di-export khusus untuk diuji unit test
};