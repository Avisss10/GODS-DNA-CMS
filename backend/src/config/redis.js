const fs = require('fs');
const path = require('path');
const Redis = require('ioredis');

let client = null;

/**
 * Membangun opsi TLS untuk koneksi ke Redis Cloud.
 * Mengembalikan undefined jika REDIS_TLS_ENABLED bukan 'true' —
 * memungkinkan koneksi non-TLS untuk Redis lokal (dev via Docker).
 *
 * Jika REDIS_TLS_CA_PATH diisi, CA dibaca dari file (pola sama
 * seperti buildSslOptions di src/config/database.js). Jika kosong,
 * TLS tetap aktif tapi memakai trust store default Node — ini
 * konsisten dengan Redis Cloud versi terkini yang tidak lagi
 * mendistribusikan Server CA terpisah untuk tier Essentials/Free.
 */
function buildTlsOptions() {
  const tlsEnabled = process.env.REDIS_TLS_ENABLED === 'true';

  if (!tlsEnabled) {
    return undefined;
  }

  const caPath = process.env.REDIS_TLS_CA_PATH;

  if (!caPath) {
    return {};
  }

  const resolvedPath = path.isAbsolute(caPath)
    ? caPath
    : path.join(process.cwd(), caPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `REDIS_TLS_CA_PATH diset ke "${caPath}" tapi file tidak ditemukan di "${resolvedPath}". ` +
      `Pastikan Server CA sudah diunduh dari dashboard Redis Cloud, ` +
      `atau kosongkan REDIS_TLS_CA_PATH untuk memakai trust store default.`
    );
  }

  return {
    ca: fs.readFileSync(resolvedPath, 'utf-8'),
  };
}

/**
 * Membuat (atau mengembalikan) Redis client tunggal (singleton),
 * mengikuti pola yang sama dengan src/config/database.js.
 * Dipakai untuk: failed_login_count, session/token blacklist,
 * refresh token storage (BAGIAN 1.1), dan Bull queue (BAGIAN 0)
 * di modul-modul berikutnya.
 */
function getRedisClient() {
  if (client) {
    return client;
  }

  const tlsOptions = buildTlsOptions();

  client = new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT) || 6379,
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 3,
    lazyConnect: false,
    ...(tlsOptions !== undefined ? { tls: tlsOptions } : {}),
  });

  return client;
}

/**
 * Memverifikasi Redis benar-benar bisa diakses dengan PING.
 * @returns {Promise<boolean>}
 */
async function testRedisConnection() {
  const currentClient = getRedisClient();
  const result = await currentClient.ping();
  return result === 'PONG';
}

/**
 * Menutup koneksi Redis secara graceful.
 */
async function closeRedis() {
  if (client) {
    await client.quit();
    client = null;
  }
}

module.exports = {
  getRedisClient,
  testRedisConnection,
  closeRedis,
  buildTlsOptions,
};