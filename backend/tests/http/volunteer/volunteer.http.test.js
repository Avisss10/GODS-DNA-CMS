require('dotenv').config();
const request = require('supertest');
const { startServer } = require('../../../src/server');
const { getPool, closePool } = require('../../../src/config/database');
const { closeRedis, getRedisClient } = require('../../../src/config/redis');
const { hashPassword } = require('../../../src/utils/password.util');
const authRepository = require('../../../src/modules/auth/auth.repository');
const jemaatRepository = require('../../../src/modules/jemaat/jemaat.repository');
const { ensureTablesExist } = require('../../helpers/ensure-tables');

const hasFullConfig =
  !!process.env.DB_HOST && !!process.env.DB_USER && !!process.env.DB_NAME &&
  !!process.env.REDIS_HOST && !!process.env.AES_ENCRYPTION_KEY && !!process.env.AUDIT_HMAC_SECRET;

const describeIfReady = hasFullConfig ? describe : describe.skip;

describeIfReady('Volunteer Endpoints — REST HTTP Test (server aktif)', () => {
  let server;
  let cookieAdmin;
  let cookieLeader;
  let adminUserId;
  let leaderUserId;
  let jemaatId;
  let jemaatDeletedId;
  let createdTypeId;

  const adminUsername = `test_http_vol_admin_${Date.now()}`;
  const leaderUsername = `test_http_vol_leader_${Date.now()}`;
  const testPassword = 'PasswordVolHttp123!';

  beforeAll(async () => {
    await ensureTablesExist();
    const pool = getPool();

    const hash = await hashPassword(testPassword);
    adminUserId = await authRepository.createUser({
      username: adminUsername, passwordHash: hash, peran: 'ADMIN',
    });
    leaderUserId = await authRepository.createUser({
      username: leaderUsername, passwordHash: hash, peran: 'LEADER',
    });

    jemaatId = await jemaatRepository.create({
      nama: `Vol HTTP Jemaat ${Date.now()}`,
      tgl_lahir: '1990-06-01', jenis_kelamin: 'L', tgl_bergabung: '2024-01-01',
    });

    jemaatDeletedId = await jemaatRepository.create({
      nama: `Vol HTTP Jemaat Deleted ${Date.now()}`,
      tgl_lahir: '1992-06-01', jenis_kelamin: 'P', tgl_bergabung: '2024-01-01',
    });
    await pool.query('UPDATE jemaat SET deleted_at = NOW() WHERE id = :id', { id: jemaatDeletedId });

    server = startServer(0);
    await new Promise((resolve) => server.on('listening', resolve));

    const adminLogin = await request(server)
      .post('/api/auth/login')
      .send({ username: adminUsername, password: testPassword });
    cookieAdmin = adminLogin.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');

    const leaderLogin = await request(server)
      .post('/api/auth/login')
      .send({ username: leaderUsername, password: testPassword });
    cookieLeader = leaderLogin.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
  }, 30000);

  afterAll(async () => {
    const pool = getPool();
    if (jemaatId) await pool.query('DELETE FROM volunteer_members WHERE jemaat_id = :id', { id: jemaatId });
    await pool.query("DELETE FROM volunteer_jenis WHERE nama LIKE 'HTTP Vol Test%'");
    if (jemaatId) await pool.query('DELETE FROM jemaat WHERE id = :id', { id: jemaatId });
    if (jemaatDeletedId) await pool.query('DELETE FROM jemaat WHERE id = :id', { id: jemaatDeletedId });
    await pool.query('DELETE FROM users WHERE id IN (:a, :b)', { a: adminUserId, b: leaderUserId });
    await pool.query("DELETE FROM audit_logs WHERE modul IN ('VOLUNTEER','AUTH')");

    const redis = getRedisClient();
    await redis.del(`active_session:${adminUserId}`);
    await redis.del(`refresh_token:${adminUserId}`);
    await redis.del(`active_session:${leaderUserId}`);
    await redis.del(`refresh_token:${leaderUserId}`);

    await new Promise((resolve) => server.close(resolve));
    await closeRedis();
    await closePool();
  }, 30000);

  // ── POST /api/volunteer-types ─────────────────────────────────
  describe('POST /api/volunteer-types', () => {
    it('401 tanpa autentikasi', async () => {
      const res = await request(server).post('/api/volunteer-types')
        .send({ nama: 'HTTP Vol Test Tanpa Auth' });
      expect(res.status).toBe(401);
    });

    it('201 ADMIN berhasil buat jenis volunteer baru', async () => {
      const res = await request(server).post('/api/volunteer-types')
        .set('Cookie', cookieAdmin)
        .send({ nama: 'HTTP Vol Test Usher', deskripsi: 'Penyambut jemaat' });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      createdTypeId = res.body.id;
    });

    it('201 LEADER juga berhasil buat jenis volunteer', async () => {
      const res = await request(server).post('/api/volunteer-types')
        .set('Cookie', cookieLeader)
        .send({ nama: 'HTTP Vol Test Singer' });
      expect(res.status).toBe(201);
    });

    it('400 nama tidak dikirim', async () => {
      const res = await request(server).post('/api/volunteer-types')
        .set('Cookie', cookieAdmin)
        .send({ deskripsi: 'Tanpa nama' });
      expect(res.status).toBe(400);
    });

    it('409 nama duplikat', async () => {
      const res = await request(server).post('/api/volunteer-types')
        .set('Cookie', cookieAdmin)
        .send({ nama: 'HTTP Vol Test Usher' });
      expect(res.status).toBe(409);
    });
  });

  // ── PUT /api/volunteer-types/:id ──────────────────────────────
  describe('PUT /api/volunteer-types/:id', () => {
    it('401 tanpa autentikasi', async () => {
      const res = await request(server).put(`/api/volunteer-types/${createdTypeId}`)
        .send({ deskripsi: 'Diupdate tanpa auth' });
      expect(res.status).toBe(401);
    });

    it('200 ADMIN berhasil update deskripsi', async () => {
      const res = await request(server).put(`/api/volunteer-types/${createdTypeId}`)
        .set('Cookie', cookieAdmin)
        .send({ deskripsi: 'Penyambut di pintu utama' });
      expect(res.status).toBe(200);
      expect(res.body.deskripsi).toBe('Penyambut di pintu utama');
    });

    it('404 id tidak ditemukan', async () => {
      const res = await request(server).put('/api/volunteer-types/999999')
        .set('Cookie', cookieAdmin)
        .send({ deskripsi: 'Apapun' });
      expect(res.status).toBe(404);
    });
  });

  // ── POST /api/jemaat/:jemaatId/volunteer ──────────────────────
  describe('POST /api/jemaat/:jemaatId/volunteer', () => {
    it('401 tanpa autentikasi', async () => {
      const res = await request(server).post(`/api/jemaat/${jemaatId}/volunteer`)
        .send({ volunteerTypeId: createdTypeId });
      expect(res.status).toBe(401);
    });

    it('400 volunteerTypeId tidak dikirim', async () => {
      const res = await request(server).post(`/api/jemaat/${jemaatId}/volunteer`)
        .set('Cookie', cookieAdmin).send({});
      expect(res.status).toBe(400);
    });

    it('404 jemaatId tidak ditemukan', async () => {
      const res = await request(server).post('/api/jemaat/999999/volunteer')
        .set('Cookie', cookieAdmin).send({ volunteerTypeId: createdTypeId });
      expect(res.status).toBe(404);
    });

    it('404 jemaat soft-deleted', async () => {
      const res = await request(server).post(`/api/jemaat/${jemaatDeletedId}/volunteer`)
        .set('Cookie', cookieAdmin).send({ volunteerTypeId: createdTypeId });
      expect(res.status).toBe(404);
    });

    it('404 volunteerTypeId tidak ditemukan', async () => {
      const res = await request(server).post(`/api/jemaat/${jemaatId}/volunteer`)
        .set('Cookie', cookieAdmin).send({ volunteerTypeId: 999999 });
      expect(res.status).toBe(404);
    });

    it('201 berhasil daftarkan jemaat ke jenis volunteer', async () => {
      const res = await request(server).post(`/api/jemaat/${jemaatId}/volunteer`)
        .set('Cookie', cookieAdmin).send({ volunteerTypeId: createdTypeId });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
    });

    it('409 duplikat — jemaat sudah terdaftar di jenis yang sama', async () => {
      const res = await request(server).post(`/api/jemaat/${jemaatId}/volunteer`)
        .set('Cookie', cookieAdmin).send({ volunteerTypeId: createdTypeId });
      expect(res.status).toBe(409);
    });
  });

  // ── GET /api/jemaat/:jemaatId/volunteer ───────────────────────
  describe('GET /api/jemaat/:jemaatId/volunteer', () => {
    it('401 tanpa autentikasi', async () => {
      const res = await request(server).get(`/api/jemaat/${jemaatId}/volunteer`);
      expect(res.status).toBe(401);
    });

    it('200 berhasil ambil daftar volunteer jemaat', async () => {
      const res = await request(server).get(`/api/jemaat/${jemaatId}/volunteer`)
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('404 jemaat soft-deleted', async () => {
      const res = await request(server).get(`/api/jemaat/${jemaatDeletedId}/volunteer`)
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(404);
    });

    it('404 jemaatId tidak ditemukan', async () => {
      const res = await request(server).get('/api/jemaat/999999/volunteer')
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /api/jemaat/:jemaatId/volunteer/:volunteerTypeId ───
  describe('DELETE /api/jemaat/:jemaatId/volunteer/:volunteerTypeId', () => {
    it('401 tanpa autentikasi', async () => {
      const res = await request(server)
        .delete(`/api/jemaat/${jemaatId}/volunteer/${createdTypeId}`);
      expect(res.status).toBe(401);
    });

    it('200 berhasil unregister', async () => {
      const res = await request(server)
        .delete(`/api/jemaat/${jemaatId}/volunteer/${createdTypeId}`)
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
    });

    it('404 unregister yang sudah tidak aktif', async () => {
      const res = await request(server)
        .delete(`/api/jemaat/${jemaatId}/volunteer/${createdTypeId}`)
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /api/volunteer-types/:id ──────────────────────────
  describe('DELETE /api/volunteer-types/:id', () => {
    it('401 tanpa autentikasi', async () => {
      const res = await request(server).delete(`/api/volunteer-types/${createdTypeId}`);
      expect(res.status).toBe(401);
    });

    it('404 id tidak ditemukan', async () => {
      const res = await request(server).delete('/api/volunteer-types/999999')
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(404);
    });

    it('200 ADMIN berhasil nonaktifkan jenis volunteer', async () => {
      const res = await request(server).delete(`/api/volunteer-types/${createdTypeId}`)
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
    });
  });
});