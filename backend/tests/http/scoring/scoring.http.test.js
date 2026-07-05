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
  !!process.env.REDIS_HOST && !!process.env.AUDIT_HMAC_SECRET;

const describeIfReady = hasFullConfig ? describe : describe.skip;

describeIfReady('POST /api/scoring/run — REST HTTP Test (server aktif)', () => {
  let server;
  let leaderCookie;
  let adminCookie;

  const leaderUsername = `test_http_scoring_leader_${Date.now()}`;
  const adminUsername = `test_http_scoring_admin_${Date.now()}`;
  const testPassword = 'PasswordScoring123!';
  let leaderUserId;
  let adminUserId;

  async function loginAs(username) {
    const res = await request(server)
      .post('/api/auth/login')
      .send({ username, password: testPassword });
    return res.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
  }

  beforeAll(async () => {
    await ensureTablesExist();
    const passwordHash = await hashPassword(testPassword);
    leaderUserId = await authRepository.createUser({
      username: leaderUsername, passwordHash, peran: 'LEADER',
    });
    adminUserId = await authRepository.createUser({
      username: adminUsername, passwordHash, peran: 'ADMIN',
    });

    server = startServer(0);
    await new Promise((resolve) => server.on('listening', resolve));

    leaderCookie = await loginAs(leaderUsername);
    adminCookie = await loginAs(adminUsername);
  }, 30000);

  afterAll(async () => {
    const pool = getPool();
    await pool.query('DELETE FROM users WHERE id IN (:leaderId, :adminId)', {
      leaderId: leaderUserId, adminId: adminUserId,
    });
    await pool.query(
      `DELETE FROM audit_logs WHERE modul = 'AUTH' AND object_id IN (:leaderId, :adminId)`,
      { leaderId: leaderUserId, adminId: adminUserId }
    );
    await pool.query(`DELETE FROM audit_logs WHERE modul = 'SCORING'`);

    const redis = getRedisClient();
    for (const id of [leaderUserId, adminUserId]) {
      await redis.del(`active_session:${id}`);
      await redis.del(`refresh_token:${id}`);
    }

    await new Promise((resolve) => server.close(resolve));
    await closeRedis();
    await closePool();
  }, 30000);

  it('401 tanpa cookie sesi', async () => {
    const res = await request(server).post('/api/scoring/run');
    expect(res.status).toBe(401);
  }, 10000);

  it('403 untuk ADMIN (hanya LEADER)', async () => {
    const res = await request(server)
      .post('/api/scoring/run')
      .set('Cookie', adminCookie);
    expect(res.status).toBe(403);
  }, 10000);

  it('200 untuk LEADER: mengembalikan ringkasan processed & skipped', async () => {
    const res = await request(server)
      .post('/api/scoring/run')
      .set('Cookie', leaderCookie);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Scoring selesai');
    expect(typeof res.body.processed).toBe('number');
    expect(typeof res.body.skipped).toBe('number');
  }, 60000);
});

if (!hasFullConfig) {
  describe('POST /api/scoring/run — REST HTTP Test', () => {
    it.skip('di-skip: konfigurasi DB/Redis belum lengkap di .env', () => {});
  });
}
