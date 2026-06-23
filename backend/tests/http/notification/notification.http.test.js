require('dotenv').config();
const request = require('supertest');
const { startServer } = require('../../../src/server');
const { getPool, closePool } = require('../../../src/config/database');
const { closeRedis, getRedisClient } = require('../../../src/config/redis');
const { hashPassword } = require('../../../src/utils/password.util');
const authRepository = require('../../../src/modules/auth/auth.repository');
const notificationRepository = require('../../../src/modules/notification/notification.repository');
const { ensureTablesExist } = require('../../helpers/ensure-tables');

const hasFullConfig =
  !!process.env.DB_HOST && !!process.env.DB_USER && !!process.env.DB_NAME &&
  !!process.env.REDIS_HOST && !!process.env.AES_ENCRYPTION_KEY && !!process.env.AUDIT_HMAC_SECRET;

const describeIfReady = hasFullConfig ? describe : describe.skip;

describeIfReady('Notification Endpoints — REST HTTP Test (server aktif)', () => {
  let server;
  let cookieLeader;
  let cookieAdmin;
  let leaderId;
  let adminId;
  let notifId;

  const leaderUsername = `test_http_notif_leader_${Date.now()}`;
  const adminUsername = `test_http_notif_admin_${Date.now()}`;
  const testPassword = 'PasswordNotifHttp123!';

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

    // Buat notifikasi dummy untuk leader
    notifId = await notificationRepository.create({
      userId: leaderId,
      jenis: 'EVENT_SELESAI',
      judul: 'Test Event Selesai',
      pesan: 'Ibadah Raya telah selesai dengan 100 jemaat hadir',
    });

    server = startServer(0);
    await new Promise((resolve) => server.on('listening', resolve));

    const leaderLogin = await request(server)
      .post('/api/auth/login')
      .send({ username: leaderUsername, password: testPassword });
    cookieLeader = leaderLogin.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');

    const adminLogin = await request(server)
      .post('/api/auth/login')
      .send({ username: adminUsername, password: testPassword });
    cookieAdmin = adminLogin.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
  }, 30000);

  afterAll(async () => {
    const pool = getPool();
    await pool.query('DELETE FROM notifications WHERE user_id IN (:a, :b)', { a: leaderId, b: adminId });
    await pool.query('DELETE FROM users WHERE id IN (:a, :b)', { a: leaderId, b: adminId });
    await pool.query("DELETE FROM audit_logs WHERE modul = 'AUTH'");

    const redis = getRedisClient();
    await redis.del(`active_session:${leaderId}`);
    await redis.del(`refresh_token:${leaderId}`);
    await redis.del(`active_session:${adminId}`);
    await redis.del(`refresh_token:${adminId}`);

    await new Promise((resolve) => server.close(resolve));
    await closeRedis();
    await closePool();
  }, 30000);

  // ── GET /api/notifications ────────────────────────────────────
  describe('GET /api/notifications', () => {
    it('401 tanpa autentikasi', async () => {
      const res = await request(server).get('/api/notifications');
      expect(res.status).toBe(401);
    });

    it('403 ADMIN tidak boleh akses notifikasi', async () => {
      const res = await request(server)
        .get('/api/notifications')
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(403);
    });

    it('200 LEADER berhasil ambil daftar notifikasi', async () => {
      const res = await request(server)
        .get('/api/notifications')
        .set('Cookie', cookieLeader);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('200 filter unread=true hanya mengembalikan yang belum dibaca', async () => {
      const res = await request(server)
        .get('/api/notifications?unread=true')
        .set('Cookie', cookieLeader);
      expect(res.status).toBe(200);
      res.body.forEach((n) => expect(Number(n.is_read)).toBe(0));
    });
  });

  // ── GET /api/notifications/unread-count ───────────────────────
  describe('GET /api/notifications/unread-count', () => {
    it('200 mengembalikan jumlah notifikasi belum dibaca', async () => {
      const res = await request(server)
        .get('/api/notifications/unread-count')
        .set('Cookie', cookieLeader);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('count');
      expect(typeof res.body.count).toBe('number');
    });
  });

  // ── PATCH /api/notifications/:id/read ─────────────────────────
  describe('PATCH /api/notifications/:id/read', () => {
    it('200 LEADER berhasil tandai notifikasi sebagai dibaca', async () => {
      const res = await request(server)
        .patch(`/api/notifications/${notifId}/read`)
        .set('Cookie', cookieLeader);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
    });

    it('404 id notifikasi tidak ditemukan atau bukan milik user', async () => {
      const res = await request(server)
        .patch('/api/notifications/999999/read')
        .set('Cookie', cookieLeader);
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /api/notifications/read-all ────────────────────────
  describe('PATCH /api/notifications/read-all', () => {
    it('200 LEADER berhasil tandai semua notifikasi sebagai dibaca', async () => {
      const res = await request(server)
        .patch('/api/notifications/read-all')
        .set('Cookie', cookieLeader);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
    });
  });
});