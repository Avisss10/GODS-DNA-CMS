require('dotenv').config();
const { getPool, closePool } = require('../../../src/config/database');
const { closeRedis, getRedisClient } = require('../../../src/config/redis');
const { hashPassword } = require('../../../src/utils/password.util');
const authRepository = require('../../../src/modules/auth/auth.repository');
const { login, logout, tokenBlacklistKey } = require('../../../src/modules/auth/auth.service');
const { ensureTablesExist } = require('../../helpers/ensure-tables');

const hasFullConfig =
  !!process.env.DB_HOST && !!process.env.DB_USER && !!process.env.DB_NAME &&
  !!process.env.REDIS_HOST;

const describeIfReady = hasFullConfig ? describe : describe.skip;

describeIfReady('auth.service logout — Integration Test (TiDB + Redis nyata)', () => {
  const testUsername = `test_logout_${Date.now()}`;
  const testPassword = 'PasswordLogout123!';
  let testUserId;
  let accessToken;

  beforeAll(async () => {
    await ensureTablesExist();
    const passwordHash = await hashPassword(testPassword);
    testUserId = await authRepository.createUser({
      username: testUsername,
      passwordHash,
      peran: 'ADMIN',
    });

    const loginResult = await login({ username: testUsername, password: testPassword });
    accessToken = loginResult.accessToken;
  }, 20000);

  afterAll(async () => {
    const pool = getPool();
    await pool.query('DELETE FROM users WHERE id = :id', { id: testUserId });
    await pool.query('DELETE FROM audit_logs WHERE object_id = :id AND modul = :modul', {
      id: testUserId, modul: 'AUTH',
    });
    const redis = getRedisClient();
    await redis.del(`active_session:${testUserId}`);
    await redis.del(`refresh_token:${testUserId}`);
    await redis.del(tokenBlacklistKey(accessToken));
    await closeRedis();
    await closePool();
  }, 30000);

  it('harus berhasil logout dan memasukkan token ke blacklist Redis', async () => {
    await logout(accessToken);

    const redis = getRedisClient();
    const isBlacklisted = await redis.get(tokenBlacklistKey(accessToken));
    expect(isBlacklisted).toBe('1');
  }, 15000);

  it('active_session harus terhapus dari Redis setelah logout', async () => {
    const redis = getRedisClient();
    const session = await redis.get(`active_session:${testUserId}`);
    expect(session).toBeNull();
  }, 15000);
});

if (!hasFullConfig) {
  describe('auth.service logout — Integration Test', () => {
    it.skip('di-skip: konfigurasi DB/Redis belum lengkap di .env', () => {});
  });
}