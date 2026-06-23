require('dotenv').config();
const path = require('path');
const {
  createConnection,
  runMigrationFile,
  dropAllTables,
} = require('../../src/database/migration-runner');

const hasDbConfig =
  !!process.env.DB_HOST && !!process.env.DB_USER && !!process.env.DB_NAME;

const describeIfDb = hasDbConfig ? describe : describe.skip;

describeIfDb('Migration Runner — Integration Test (TiDB nyata)', () => {
  let connection;

  beforeAll(async () => {
    connection = await createConnection();
  }, 30000);

  beforeEach(async () => {
    // Pastikan setiap test dimulai dari database yang benar-benar
    // kosong, supaya test #1 dan test #2 tidak saling bergantung
    // pada urutan eksekusi atau state tabel yang ditinggalkan
    // test sebelumnya (setiap test harus independen/idempotent).
    await dropAllTables(connection);
  }, 30000);

  afterAll(async () => {
    if (connection) {
      await dropAllTables(connection);
      await connection.end();
    }
  }, 30000);

  it('harus berhasil menjalankan migration dan membuat 16 tabel', async () => {
    const migrationFile = path.join(
      __dirname,
      '../../src/database/migrations/001_initial_schema.sql'
    );

    await runMigrationFile(connection, migrationFile);

    const [rows] = await connection.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ?`,
      [process.env.DB_NAME]
    );

    const tableNames = rows.map((r) => r.TABLE_NAME).sort();
    const expectedTables = [
      'audit_logs', 'cell_group', 'cell_group_members', 'cg_absensi',
      'cg_meeting', 'cg_meeting_photos', 'event', 'event_attendances',
      'event_kehadiran', 'event_volunteer', 'event_volunteer_needs',
      'jemaat', 'users', 'volunteer_jenis', 'volunteer_members', 'notifications',
    ].sort();

    expect(tableNames).toEqual(expectedTables);
  }, 30000);

  it('dropAllTables harus berhasil menghapus seluruh tabel tanpa error FK', async () => {
    const migrationFile = path.join(
      __dirname,
      '../../src/database/migrations/001_initial_schema.sql'
    );
    await runMigrationFile(connection, migrationFile);

    await dropAllTables(connection);

    const [rows] = await connection.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ?`,
      [process.env.DB_NAME]
    );

    expect(rows).toHaveLength(0);
  }, 30000);
});

if (!hasDbConfig) {
  describe('Migration Runner — Integration Test', () => {
    it.skip('di-skip: DB_HOST/DB_USER/DB_NAME belum dikonfigurasi di .env', () => {});
  });
}