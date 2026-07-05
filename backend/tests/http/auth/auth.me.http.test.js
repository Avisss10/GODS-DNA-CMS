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

describeIfReady('GET /api/auth/me — REST HTTP Test (server aktif)', () => {
  let server;
  let cookieHeader;

  const testUsername = `test_http_me_${Date.now()}`;
  const testPassword = 'PasswordMe123!';
  let testUserId;

  beforeAll(async () => {
    await ensureTablesExist();
    const passwordHash = await hashPassword(testPassword);
    testUserId = await authRepository.createUser({
      username: testUsername, passwordHash, peran: 'ADMIN',
    });

    server = startServer(0);
    await new Promise((resolve) => server.on('listening', resolve));

    const loginRes = await request(server)
      .post('/api/auth/login')
      .send({ username: testUsername, password: testPassword });
    cookieHeader = loginRes.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
  }, 30000);

  afterAll(async () => {
    const pool = getPool();
    await pool.query('DELETE FROM users WHERE id = :id', { id: testUserId });
    await pool.query('DELETE FROM audit_logs WHERE object_id = :id AND modul = :modul', {
      id: testUserId, modul: 'AUTH',
    });

    const redis = getRedisClient();
    await redis.del(`active_session:${testUserId}`);
    await redis.del(`refresh_token:${testUserId}`);
    await redis.del(`known_ips:${testUserId}`);

    await new Promise((resolve) => server.close(resolve));
    await closeRedis();
    await closePool();
  }, 30000);

  it('401 tanpa cookie sesi', async () => {
    const res = await request(server).get('/api/auth/me');
    expect(res.status).toBe(401);
  }, 10000);

  it('200 dengan cookie sesi: mengembalikan { userId, peran, nama } segar dari DB', async () => {
    const res = await request(server)
      .get('/api/auth/me')
      .set('Cookie', cookieHeader);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      userId: testUserId,
      peran: 'ADMIN',
      nama: testUsername,
    });
  }, 10000);

  it('401 jika user dinonaktifkan setelah login', async () => {
    await authRepository.updateAktif(testUserId, false);

    const res = await request(server)
      .get('/api/auth/me')
      .set('Cookie', cookieHeader);

    expect(res.status).toBe(401);

    await authRepository.updateAktif(testUserId, true);
  }, 10000);
});

if (!hasFullConfig) {
  describe('GET /api/auth/me — REST HTTP Test', () => {
    it.skip('di-skip: konfigurasi DB/Redis belum lengkap di .env', () => {});
  });
}
