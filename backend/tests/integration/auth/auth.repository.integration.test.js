require('dotenv').config();
const path = require('path');
const { getPool, closePool } = require('../../../src/config/database');
const { runMigrationFile } = require('../../../src/database/migration-runner');
const repo = require('../../../src/modules/auth/auth.repository');

const hasDbConfig =
  !!process.env.DB_HOST && !!process.env.DB_USER && !!process.env.DB_NAME;

const describeIfDb = hasDbConfig ? describe : describe.skip;

describeIfDb('auth.repository — Integration Test (TiDB nyata)', () => {
  const testUsername = `test_user_${Date.now()}`;
  let createdUserId;

  beforeAll(async () => {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'`,
      [process.env.DB_NAME]
    );

    if (rows.length === 0) {
      const connectionForMigration = await require('../../../src/database/migration-runner').createConnection();
      const migrationFile = path.join(
        __dirname,
        '../../../src/database/migrations/001_initial_schema.sql'
      );
      await runMigrationFile(connectionForMigration, migrationFile);
      await connectionForMigration.end();
    }
  }, 30000);

  afterAll(async () => {
    if (createdUserId) {
      const pool = getPool();
      await pool.query('DELETE FROM users WHERE id = :id', { id: createdUserId });
    }
    await closePool();
  }, 30000);

  it('createUser harus berhasil menyimpan user baru ke database', async () => {
    const id = await repo.createUser({
      username: testUsername,
      passwordHash: 'fake-hash-for-test',
      peran: 'ADMIN',
    });

    expect(typeof id).toBe('number');
    createdUserId = id;
  }, 15000);

  it('findByUsername harus menemukan user yang baru dibuat', async () => {
    const user = await repo.findByUsername(testUsername);

    expect(user).not.toBeNull();
    expect(user.username).toBe(testUsername);
    expect(user.peran).toBe('ADMIN');
    expect(user.aktif).toBe(1); // TiDB mengembalikan boolean sebagai 1/0
  }, 15000);

  it('findById harus menemukan user yang sama berdasarkan id', async () => {
    const user = await repo.findById(createdUserId);

    expect(user).not.toBeNull();
    expect(user.username).toBe(testUsername);
  }, 15000);

  it('findByUsername harus mengembalikan null untuk username yang tidak ada', async () => {
    const user = await repo.findByUsername('username_tidak_pernah_ada_xyz');
    expect(user).toBeNull();
  }, 15000);

  it('updateLastLogin harus memperbarui kolom last_login_at', async () => {
    await repo.updateLastLogin(createdUserId);
    const user = await repo.findById(createdUserId);

    expect(user.last_login_at).not.toBeNull();
  }, 15000);

  it('updateAktif harus memperbarui kolom aktif menjadi false', async () => {
    await repo.updateAktif(createdUserId, false);
    const user = await repo.findById(createdUserId);

    expect(user.aktif).toBe(0);
  }, 15000);

  it('countActiveLeaders harus mengembalikan jumlah leader aktif yang benar', async () => {
    const before = await repo.countActiveLeaders();

    const leaderId = await repo.createUser({
      username: `test_leader_${Date.now()}`,
      passwordHash: 'fake-hash',
      peran: 'LEADER',
    });

    const after = await repo.countActiveLeaders();
    expect(after).toBe(before + 1);

    const pool = getPool();
    await pool.query('DELETE FROM users WHERE id = :id', { id: leaderId });
  }, 15000);
});

if (!hasDbConfig) {
  describe('auth.repository — Integration Test', () => {
    it.skip('di-skip: DB_HOST/DB_USER/DB_NAME belum dikonfigurasi di .env', () => {});
  });
}