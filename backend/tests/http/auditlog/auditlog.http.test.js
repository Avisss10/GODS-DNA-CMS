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
  !!process.env.REDIS_HOST && !!process.env.AES_ENCRYPTION_KEY && !!process.env.AUDIT_HMAC_SECRET;

const describeIfReady = hasFullConfig ? describe : describe.skip;

describeIfReady('Audit Log Endpoints — REST HTTP Test (server aktif)', () => {
  let server;
  let cookieLeader;
  let cookieAdmin;
  let leaderId;
  let adminId;
  let auditLogId;

  const leaderUsername = `test_http_auditlog_leader_${Date.now()}`;
  const adminUsername = `test_http_auditlog_admin_${Date.now()}`;
  const testPassword = 'PasswordAuditHttp123!';

  beforeAll(async () => {
    await ensureTablesExist();
    const pool = getPool();

    const hash = await hashPassword(testPassword);
    leaderId = await authRepository.createUser({
      username: leaderUsername, passwordHash: hash, peran: 'LEADER',
    });
    adminId = await authRepository.createUser({
      username: adminUsername, passwordHash: hash, peran: 'ADMIN',
    });

    server = startServer(0);
    await new Promise((resolve) => server.on('listening', resolve));

    // Login LEADER
    const leaderLogin = await request(server)
      .post('/api/auth/login')
      .send({ username: leaderUsername, password: testPassword });
    cookieLeader = leaderLogin.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');

    // Login ADMIN
    const adminLogin = await request(server)
      .post('/api/auth/login')
      .send({ username: adminUsername, password: testPassword });
    cookieAdmin = adminLogin.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');

    // Ambil satu audit log id untuk test by id
    const [rows] = await pool.query(
      'SELECT id FROM audit_logs ORDER BY created_at DESC LIMIT 1'
    );
    if (rows.length > 0) auditLogId = rows[0].id;
  }, 30000);

  afterAll(async () => {
    const pool = getPool();
    await pool.query('DELETE FROM users WHERE id IN (:a, :b)', { a: leaderId, b: adminId });

    const redis = getRedisClient();
    await redis.del(`active_session:${leaderId}`);
    await redis.del(`refresh_token:${leaderId}`);
    await redis.del(`active_session:${adminId}`);
    await redis.del(`refresh_token:${adminId}`);

    await new Promise((resolve) => server.close(resolve));
    await closeRedis();
    await closePool();
  }, 30000);

  // ── GET /api/audit-logs ───────────────────────────────────────
  describe('GET /api/audit-logs', () => {
    it('401 tanpa autentikasi', async () => {
      const res = await request(server).get('/api/audit-logs');
      expect(res.status).toBe(401);
    });

    it('403 ADMIN tidak boleh akses audit log', async () => {
      const res = await request(server)
        .get('/api/audit-logs')
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(403);
    });

    it('200 LEADER berhasil ambil daftar audit log', async () => {
      const res = await request(server)
        .get('/api/audit-logs')
        .set('Cookie', cookieLeader);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('200 hasil audit log mengandung field hmac_valid dan hmac_status', async () => {
      const res = await request(server)
        .get('/api/audit-logs')
        .set('Cookie', cookieLeader);
      expect(res.status).toBe(200);
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty('hmac_valid');
        expect(res.body[0]).toHaveProperty('hmac_status');
      }
    });

    it('200 filter by modul AUTH mengembalikan hanya log AUTH', async () => {
      const res = await request(server)
        .get('/api/audit-logs?modul=AUTH')
        .set('Cookie', cookieLeader);
      expect(res.status).toBe(200);
      res.body.forEach((log) => expect(log.modul).toBe('AUTH'));
    });
  });

  // ── GET /api/audit-logs/:id ───────────────────────────────────
  describe('GET /api/audit-logs/:id', () => {
    it('401 tanpa autentikasi', async () => {
      const res = await request(server).get(`/api/audit-logs/${auditLogId ?? 1}`);
      expect(res.status).toBe(401);
    });

    it('404 id tidak ditemukan', async () => {
      const res = await request(server)
        .get('/api/audit-logs/999999999')
        .set('Cookie', cookieLeader);
      expect(res.status).toBe(404);
    });

    it('200 LEADER berhasil ambil satu audit log by id', async () => {
      if (!auditLogId) return; // skip jika DB kosong
      const res = await request(server)
        .get(`/api/audit-logs/${auditLogId}`)
        .set('Cookie', cookieLeader);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(auditLogId);
      expect(res.body).toHaveProperty('hmac_valid');
      expect(res.body).toHaveProperty('hmac_status');
    });
  });
});