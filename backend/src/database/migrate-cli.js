require('dotenv').config();
const path = require('path');
const {
  createConnection,
  runMigrationFile,
  dropAllTables,
} = require('./migration-runner');

async function main() {
  const shouldReset = process.argv.includes('--reset');
  const connection = await createConnection();

  try {
    if (shouldReset) {
      console.log('Dropping seluruh tabel (reset mode)...');
      const dropped = await dropAllTables(connection);
      console.log(`${dropped} tabel berhasil di-drop.`);
    }

    const migrationFile = path.join(
      __dirname,
      'migrations',
      '001_initial_schema.sql'
    );
    console.log('Menjalankan migration: 001_initial_schema.sql');
    const count = await runMigrationFile(connection, migrationFile);
    console.log(`${count} statement berhasil dieksekusi.`);
    console.log('Migration selesai.');
  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error('Migration gagal:', err.message);
  process.exit(1);
});