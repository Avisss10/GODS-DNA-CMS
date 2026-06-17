require('dotenv').config();
const { getPool, closePool } = require('../../../src/config/database');
const { closeRedis, getRedisClient } = require('../../../src/config/redis');
const { hashPassword } = require('../../../src/utils/password.util');
const authRepository = require('../../../src/modules/auth/auth.repository');
const { login, AuthError } = require('../../../src/modules/auth/auth.service');
const { ensureTablesExist } = require('../../helpers/ensure-tables');

const hasFullConfig =
  !!process.env.DB_HOST && !!process.env.DB_USER && !!process.env.DB_NAME &&
  !!process.env.REDIS_HOST;

const describeIfReady = hasFullConfig ? describe : describe.skip;

describeIfReady('auth.service login — Integration Test (TiDB + Redis nyata)', () => {
  const testUsername = `test_login_${Date.now()}`;
  const testPassword = 'PasswordBenar123!';
  let testUserId;

  beforeAll(async () => {
    await ensureTablesExist();
    const passwordHash = await hashPassword(testPassword);
    testUserId = await authRepository.createUser({
      username: testUsername,
      passwordHash,
      peran: 'ADMIN',
    });
  }, 20000);

  afterAll(async () => {
    const pool = getPool();
    await pool.query('DELETE FROM users WHERE id = :id', { id: testUserId });
    await pool.query('DELETE FROM audit_logs WHERE object_id = :id AND modul = :modul', {
      id: testUserId, modul: 'AUTH',
    });
    const redis = getRedisClient();
    await redis.del(`login_fail:${testUsername}`);
    await redis.del(`active_session:${testUserId}`);
    await redis.del(`refresh_token:${testUserId}`);
    await closeRedis();
    await closePool();
  }, 30000);

  it('harus gagal dengan 401 untuk password salah', async () => {
    await expect(login({ username: testUsername, password: 'salah-total' }))
      .rejects.toMatchObject({ statusCode: 401 });
  }, 15000);

  it('harus berhasil login dengan kredensial benar dan mengembalikan peran serta nama', async () => {
    const result = await login({ username: testUsername, password: testPassword });

    expect(result.peran).toBe('ADMIN');
    expect(result.nama).toBe(testUsername);
    expect(typeof result.accessToken).toBe('string');
    expect(typeof result.refreshToken).toBe('string');
  }, 15000);

  it('last_login_at harus terupdate setelah login berhasil', async () => {
    const user = await authRepository.findById(testUserId);
    expect(user.last_login_at).not.toBeNull();
  }, 15000);

  it('harus mengunci akun setelah 3x percobaan password salah (rate limit)', async () => {
    const lockUsername = `test_lockout_${Date.now()}`;
    const lockPassword = 'PasswordLockout123!';
    const lockUserId = await authRepository.createUser({
      username: lockUsername,
      passwordHash: await hashPassword(lockPassword),
      peran: 'ADMIN',
    });

    for (let i = 0; i < 3; i++) {
      await expect(login({ username: lockUsername, password: 'salah' }))
        .rejects.toMatchObject({ statusCode: 401 });
    }

    await expect(login({ username: lockUsername, password: lockPassword }))
      .rejects.toMatchObject({ statusCode: 429 });

    const pool = getPool();
    await pool.query('DELETE FROM users WHERE id = :id', { id: lockUserId });
    const redis = getRedisClient();
    await redis.del(`login_fail:${lockUsername}`);
  }, 20000);
});

if (!hasFullConfig) {
  describe('auth.service login — Integration Test', () => {
    it.skip('di-skip: konfigurasi DB/Redis belum lengkap di .env', () => {});
  });
}