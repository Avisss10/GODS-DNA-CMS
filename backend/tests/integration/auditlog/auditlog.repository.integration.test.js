require('dotenv').config();
const { getPool, closePool } = require('../../../src/config/database');
const {
  recordAuditLog,
  findByIdWithVerification,
} = require('../../../src/modules/auditlog/auditlog.repository');

const hasDbConfig =
  !!process.env.DB_HOST && !!process.env.DB_USER && !!process.env.DB_NAME;

const describeIfDb = hasDbConfig ? describe : describe.skip;

describeIfDb('auditlog.repository — Integration Test (TiDB nyata)', () => {
  let createdId;

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