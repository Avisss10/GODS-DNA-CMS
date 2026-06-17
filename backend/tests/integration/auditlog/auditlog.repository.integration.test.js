require('dotenv').config();
const path = require('path');
const { getPool, closePool } = require('../../../src/config/database');
const { runMigrationFile, createConnection } = require('../../../src/database/migration-runner');
const {
  recordAuditLog,
  findByIdWithVerification,
} = require('../../../src/modules/auditlog/auditlog.repository');

const hasDbConfig =
  !!process.env.DB_HOST && !!process.env.DB_USER && !!process.env.DB_NAME;

const describeIfDb = hasDbConfig ? describe : describe.skip;

describeIfDb('auditlog.repository — Integration Test (TiDB nyata)', () => {
  let createdId;

  beforeAll(async () => {
    // Pastikan tabel audit_logs (dan tabel lain) tersedia, tidak
    // peduli apakah migration.integration.test.js sudah berjalan
    // dan membersihkan tabel sebelumnya (lihat pola yang sama di
    // auth.repository.integration.test.js, Step 9.3).
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'audit_logs'`,
      [process.env.DB_NAME]
    );

    if (rows.length === 0) {
      const connectionForMigration = await createConnection();
      const migrationFile = path.join(
        __dirname,
        '../../../src/database/migrations/001_initial_schema.sql'
      );
      await runMigrationFile(connectionForMigration, migrationFile);
      await connectionForMigration.end();
    }
  }, 30000);

  afterAll(async () => {
    if (createdId) {
      const pool = getPool();
      await pool.query('DELETE FROM audit_logs WHERE id = :id', { id: createdId });
    }
    await closePool();
  }, 30000);

  it('recordAuditLog harus berhasil menyimpan entri dengan hmac_signature valid', async () => {
    createdId = await recordAuditLog({
      userId: null,
      aksi: 'LOGIN',
      modul: 'AUTH',
      objectId: null,
      dataSebelum: null,
      dataSesudah: { peran: 'ADMIN' },
    });

    expect(typeof createdId).toBe('number');
  }, 15000);

  it('findByIdWithVerification harus mengembalikan isTampered=false untuk entri yang baru dibuat', async () => {
    const result = await findByIdWithVerification(createdId);

    expect(result).not.toBeNull();
    expect(result.isTampered).toBe(false);
    expect(result.aksi).toBe('LOGIN');
    expect(result.modul).toBe('AUTH');
  }, 15000);

  it('harus mendeteksi tamper jika data_sesudah diubah manual setelah insert', async () => {
    const pool = getPool();
    await pool.query(
      "UPDATE audit_logs SET data_sesudah = :tampered WHERE id = :id",
      { tampered: JSON.stringify({ peran: 'LEADER_DIUBAH_PAKSA' }), id: createdId }
    );

    const result = await findByIdWithVerification(createdId);
    expect(result.isTampered).toBe(true);
  }, 15000);
});

if (!hasDbConfig) {
  describe('auditlog.repository — Integration Test', () => {
    it.skip('di-skip: DB_HOST/DB_USER/DB_NAME belum dikonfigurasi di .env', () => {});
  });
}