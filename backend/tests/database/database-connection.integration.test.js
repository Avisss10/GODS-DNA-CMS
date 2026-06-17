require('dotenv').config();

const hasDbConfig =
  !!process.env.DB_HOST && !!process.env.DB_USER && !!process.env.DB_NAME;

const describeIfDb = hasDbConfig ? describe : describe.skip;

describeIfDb('Database Connection — Integration Test (TiDB nyata)', () => {
  let testConnection, closePool, getPool;

  beforeAll(() => {
    jest.resetModules();
    ({ testConnection, closePool, getPool } = require('../../src/config/database'));
  });

  afterAll(async () => {
    await closePool();
  });

  it('testConnection harus berhasil terhubung ke TiDB sungguhan', async () => {
    const result = await testConnection();
    expect(result).toBe(true);
  });

  it('pool harus bisa menjalankan query sederhana lebih dari sekali (reuse koneksi)', async () => {
    const pool = getPool();
    const [rows1] = await pool.query('SELECT 1 + 1 AS hasil');
    const [rows2] = await pool.query('SELECT 2 + 2 AS hasil');

    expect(rows1[0].hasil).toBe(2);
    expect(rows2[0].hasil).toBe(4);
  });
});

if (!hasDbConfig) {
  describe('Database Connection — Integration Test', () => {
    it.skip('di-skip: DB_HOST/DB_USER/DB_NAME belum dikonfigurasi di .env', () => {});
  });
}