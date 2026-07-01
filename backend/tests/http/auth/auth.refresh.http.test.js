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

describeIfReady('POST /api/auth/refresh — REST HTTP Test (server aktif)', () => {
  let server;
  const testUsername = `test_http_refresh_${Date.now()}`;
  const testPassword = 'PasswordHttp123!';
  let testUserId;

  function extractCookie(cookies, name) {
    const found = (cookies || []).find((c) => c.startsWith(`${name}=`));
    return found ? found.split(';')[0] : null;
  }

  beforeAll(async () => {
    await ensureTablesExist();
    const passwordHash = await hashPassword(testPassword);
    testUserId = await authRepository.createUser({
      username: testUsername,
      passwordHash,
      peran: 'LEADER',
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
    await redis.del(`login_fail:${testUsername}`);
    await redis.del(`active_session:${testUserId}`);
    await redis.del(`refresh_token:${testUserId}`);

    await new Promise((resolve) => server.close(resolve));
    await closeRedis();
    await closePool();
  }, 30000);

  it('harus 401 jika tidak ada cookie refresh_token', async () => {
    const res = await request(server).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  }, 10000);

  it('harus 401 jika refresh token tidak valid', async () => {
    const res = await request(server)
      .post('/api/auth/refresh')
      .set('Cookie', 'refresh_token=token-ngawur');
    expect(res.status).toBe(401);
  }, 10000);

  it('harus 200 dan set cookie access_token baru untuk refresh token valid', async () => {
    const loginRes = await request(server)
      .post('/api/auth/login')
      .send({ username: testUsername, password: testPassword });
    const refreshCookie = extractCookie(loginRes.headers['set-cookie'], 'refresh_token');
    expect(refreshCookie).not.toBeNull();

    const res = await request(server)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie);

    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'];
    expect(cookies.some((c) => c.startsWith('access_token=') && c.includes('HttpOnly'))).toBe(true);
  }, 10000);
});

if (!hasFullConfig) {
  describe('POST /api/auth/refresh — REST HTTP Test', () => {
    it.skip('di-skip: konfigurasi DB/Redis belum lengkap di .env', () => {});
  });
}
