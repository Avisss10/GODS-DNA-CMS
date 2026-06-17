const path = require('path');
const { getPool } = require('../../src/config/database');
const { runMigrationFile, createConnection } = require('../../src/database/migration-runner');

/**
 * Memastikan seluruh tabel (skema lengkap) tersedia di database
 * sebelum integration/HTTP test berjalan, tidak peduli apakah
 * migration.integration.test.js sudah berjalan sebelumnya dan
 * membersihkan tabel (dropAllTables) sebagai bagian dari proses
 * pengujiannya sendiri.
 *
 * Dipanggil di beforeAll setiap integration/HTTP test yang butuh
 * tabel tersedia — cukup cek satu tabel representatif (default:
 * 'users') untuk efisiensi, karena migration selalu all-or-nothing
 * (15 tabel dibuat bersamaan dalam satu file SQL).
 */
async function ensureTablesExist(representativeTable = 'users') {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [process.env.DB_NAME, representativeTable]
  );

  if (rows.length === 0) {
    const connectionForMigration = await createConnection();
    const migrationFile = path.join(
      __dirname,
      '../../src/database/migrations/001_initial_schema.sql'
    );
    await runMigrationFile(connectionForMigration, migrationFile);
    await connectionForMigration.end();
  }
}

module.exports = { ensureTablesExist };