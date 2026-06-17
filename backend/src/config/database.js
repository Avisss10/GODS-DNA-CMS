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
    ...(sslOptions ? { ssl: sslOptions } : {}),
  });

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