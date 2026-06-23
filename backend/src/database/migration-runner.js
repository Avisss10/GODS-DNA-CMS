const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { buildSslOptions } = require('../config/database');

/**
 * Membaca file .sql dan memecahnya menjadi array statement individual.
 * - Menghapus baris komentar SQL (diawali --)
 * - Memecah berdasarkan delimiter ";"
 * - Mengabaikan statement kosong (hasil dari baris kosong/komentar saja)
 *
 * Catatan: parser ini sengaja sederhana (tidak menangani ";" di dalam
 * string literal) karena schema.sql kita tidak punya literal string
 * yang mengandung ";" — sesuai isi aktual schema.sql Step 6.
 */
function parseStatements(sqlContent) {
  const withoutComments = sqlContent
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  return withoutComments
    .split(';')
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);
}

/**
 * Membuat koneksi baru ke TiDB menggunakan kredensial dari environment.
 * multipleStatements tidak diperlukan karena kita eksekusi satu per satu.
 */
async function createConnection(overrideConfig = {}) {
  const sslOptions = buildSslOptions();

  return mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 4000,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: false,
    ...(sslOptions ? { ssl: sslOptions } : {}),
    ...overrideConfig,
  });
}

/**
 * Menjalankan satu file migration (.sql) ke koneksi yang diberikan.
 * Statement dieksekusi berurutan (bukan paralel) agar FK antar tabel
 * yang saling bergantung tidak gagal karena urutan.
 */
async function runMigrationFile(connection, filePath) {
  const sqlContent = fs.readFileSync(filePath, 'utf-8');
  const statements = parseStatements(sqlContent);

  for (const statement of statements) {
    await connection.query(statement);
  }

  return statements.length;
}

/**
 * Drop seluruh 16 tabel jika ada, dalam urutan KEBALIKAN dari pembuatan
 * (child table dulu, baru parent) agar tidak melanggar FK constraint.
 * Dipakai untuk reset state sebelum integration test.
 */
async function dropAllTables(connection) {
  const dropOrder = [
    'notifications',
    'audit_logs',
    'event_kehadiran',
    'event_attendances',
    'event_volunteer',
    'event_volunteer_needs',
    'event',
    'volunteer_members',
    'volunteer_jenis',
    'cg_absensi',
    'cg_meeting_photos',
    'cg_meeting',
    'cell_group_members',
    'cell_group',
    'jemaat',
    'users',
  ];

  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of dropOrder) {
    await connection.query(`DROP TABLE IF EXISTS ${table}`);
  }
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');

  return dropOrder.length;
}

/**
 * Menjalankan provisioning privilege append-only untuk audit_logs
 * sesuai BAGIAN 8.3: REVOKE UPDATE, DELETE dari app_user.
 *
 * Catatan: REVOKE hanya valid jika user 'app_user' sudah ada dan
 * koneksi saat ini punya privilege GRANT OPTION. Pada environment
 * TiDB managed (misal TiDB Cloud Serverless), langkah ini mungkin
 * perlu dijalankan oleh admin DB secara manual jika user koneksi
 * default tidak memiliki privilege administratif — fungsi ini
 * akan melempar error yang jelas jika gagal, bukan diam-diam skip.
 */
async function enforceAuditLogAppendOnly(connection, appUser = 'app_user') {
  await connection.query(
    `REVOKE UPDATE, DELETE ON ${process.env.DB_NAME}.audit_logs FROM '${appUser}'@'%'`
  );
}

module.exports = {
  parseStatements,
  createConnection,
  runMigrationFile,
  dropAllTables,
  enforceAuditLogAppendOnly,
};