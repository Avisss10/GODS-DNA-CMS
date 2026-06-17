require('dotenv').config();
const request = require('supertest');
const { startServer } = require('../../../src/server');
const { getPool, closePool } = require('../../../src/config/database');
const { closeRedis, getRedisClient } = require('../../../src/config/redis');
const { hashPassword } = require('../../../src/utils/password.util');
const authRepository = require('../../../src/modules/auth/auth.repository');
const { ensureTablesExist } = require('../../helpers/ensure-tables');

const hasFullConfig =
  !!process.env.DB_HOST && !!process.env.DB_USER && !!process.env.DB_NAME &&
  !!process.env.REDIS_HOST;

const describeIfReady = hasFullConfig ? describe : describe.skip;

describeIfReady('POST /api/auth/logout — REST HTTP Test (server aktif)', () => {
  let server;
  const testUsername = `test_http_logout_${Date.now()}`;
  const testPassword = 'PasswordHttpLogout123!';
  let testUserId;

  beforeAll(async () => {
    await ensureTablesExist();
    const passwordHash = await hashPassword(testPassword);
    testUserId = await authRepository.createUser({
      username: testUsername,
      passwordHash,
      peran: 'ADMIN',
    });

    server = startServer(0);
    await new Promise((resolve) => server.on('listening', resolve));
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

    await new Promise((resolve) => server.close(resolve));
    await closeRedis();
    await closePool();
  }, 30000);

  it('harus 401 jika logout dipanggil tanpa cookie sama sekali', async () => {
    const res = await request(server).post('/api/auth/logout');
    expect(res.status).toBe(401);
  }, 10000);

  it('harus 200 dan clear cookie setelah login lalu logout', async () => {
    const loginRes = await request(server)
      .post('/api/auth/login')
      .send({ username: testUsername, password: testPassword });

    const cookies = loginRes.headers['set-cookie'];
    const cookieHeader = cookies.map((c) => c.split(';')[0]).join('; ');

    const logoutRes = await request(server)
      .post('/api/auth/logout')
      .set('Cookie', cookieHeader);

    expect(logoutRes.status).toBe(200);

    const clearedCookies = logoutRes.headers['set-cookie'];
    expect(clearedCookies.some((c) => c.startsWith('access_token=;'))).toBe(true);
  }, 15000);

  it('token yang sudah logout tidak boleh bisa dipakai lagi untuk akses endpoint terlindungi', async () => {
    const loginRes = await request(server)
      .post('/api/auth/login')
      .send({ username: testUsername, password: testPassword });

    const cookies = loginRes.headers['set-cookie'];
    const cookieHeader = cookies.map((c) => c.split(';')[0]).join('; ');

    await request(server).post('/api/auth/logout').set('Cookie', cookieHeader);

    const secondLogoutRes = await request(server)
      .post('/api/auth/logout')
      .set('Cookie', cookieHeader);

    expect(secondLogoutRes.status).toBe(401);
  }, 15000);
});

if (!hasFullConfig) {
  describe('POST /api/auth/logout — REST HTTP Test', () => {
    it.skip('di-skip: konfigurasi DB/Redis belum lengkap di .env', () => {});
  });
}