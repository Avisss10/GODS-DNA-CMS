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

describeIfReady('User Management Endpoints — REST HTTP Test (server aktif)', () => {
  let server;
  let cookieLeader;
  let cookieAdmin;
  let leaderUserId;
  let adminUserId;
  let soleLeaderUserId;
  const createdUserIds = [];

  const leaderUsername = `test_http_users_leader_${Date.now()}`;
  const adminUsername = `test_http_users_admin_${Date.now()}`;
  const soleLeaderUsername = `test_http_users_sole_leader_${Date.now()}`;
  const testPassword = 'PasswordUsersHttp123!';

  beforeAll(async () => {
    await ensureTablesExist();
    const pool = getPool();

    const hash = await hashPassword(testPassword);
    leaderUserId = await authRepository.createUser({ username: leaderUsername, passwordHash: hash, peran: 'LEADER' });
    adminUserId = await authRepository.createUser({ username: adminUsername, passwordHash: hash, peran: 'ADMIN' });
    soleLeaderUserId = await authRepository.createUser({ username: soleLeaderUsername, passwordHash: hash, peran: 'LEADER' });

    server = startServer(0);
    await new Promise((resolve) => server.on('listening', resolve));

    const loginLeader = await request(server).post('/api/auth/login').send({ username: leaderUsername, password: testPassword });
    cookieLeader = loginLeader.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');

    const loginAdmin = await request(server).post('/api/auth/login').send({ username: adminUsername, password: testPassword });
    cookieAdmin = loginAdmin.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
  }, 30000);

  afterAll(async () => {
    const pool = getPool();
    const ids = [leaderUserId, adminUserId, soleLeaderUserId, ...createdUserIds].filter(Boolean);
    for (const id of ids) {
      await pool.query('DELETE FROM users WHERE id = :id', { id });
    }
    await pool.query("DELETE FROM audit_logs WHERE modul IN ('USER','AUTH')");

    const redis = getRedisClient();
    for (const id of [leaderUserId, adminUserId, soleLeaderUserId]) {
      await redis.del(`active_session:${id}`);
      await redis.del(`refresh_token:${id}`);
    }

    await new Promise((resolve) => server.close(resolve));
    await closeRedis();
    await closePool();
  }, 30000);

  describe('POST /api/users', () => {
    it('401 tanpa autentikasi', async () => {
      const res = await request(server).post('/api/users').send({ username: 'x', password: 'PasswordX123', peran: 'ADMIN' });
      expect(res.status).toBe(401);
    });

    it('403 jika dipanggil sebagai ADMIN', async () => {
      const res = await request(server)
        .post('/api/users')
        .set('Cookie', cookieAdmin)
        .send({ username: `newuser_${Date.now()}`, password: 'PasswordX123', peran: 'ADMIN' });
      expect(res.status).toBe(403);
    });

    it('201 jika dipanggil sebagai LEADER dengan data valid', async () => {
      const username = `newadmin_http_${Date.now()}`;
      const res = await request(server)
        .post('/api/users')
        .set('Cookie', cookieLeader)
        .send({ username, password: 'PasswordX123', peran: 'ADMIN' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ username, peran: 'ADMIN' });
      expect(res.body.password_hash).toBeUndefined();
      createdUserIds.push(res.body.id);
    }, 15000);

    it('400 jika password kurang dari 8 karakter', async () => {
      const res = await request(server)
        .post('/api/users')
        .set('Cookie', cookieLeader)
        .send({ username: `shortpw_${Date.now()}`, password: 'short', peran: 'ADMIN' });
      expect(res.status).toBe(400);
    });

    it('409 jika username sudah terdaftar', async () => {
      const res = await request(server)
        .post('/api/users')
        .set('Cookie', cookieLeader)
        .send({ username: adminUsername, password: 'PasswordX123', peran: 'ADMIN' });
      expect(res.status).toBe(409);
    }, 15000);
  });

  describe('PATCH /api/users/:id/status', () => {
    it('401 tanpa autentikasi', async () => {
      const res = await request(server).patch(`/api/users/${adminUserId}/status`).send({ aktif: false });
      expect(res.status).toBe(401);
    });

    it('200 sebagai LEADER menonaktifkan ADMIN', async () => {
      const res = await request(server)
        .patch(`/api/users/${adminUserId}/status`)
        .set('Cookie', cookieLeader)
        .send({ aktif: false });
      expect(res.status).toBe(200);

      // kembalikan ke aktif agar tidak mengganggu test lain jika di-rerun
      await request(server).patch(`/api/users/${adminUserId}/status`).set('Cookie', cookieLeader).send({ aktif: true });
    }, 15000);

    it('400 saat menonaktifkan satu-satunya LEADER aktif', async () => {
      // Sengaja memakai transaksi DB nyata (bukan mock) untuk membuktikan
      // rule ini benar-benar tertegak end-to-end. Karena tabel users
      // dipakai bersama (shared, bukan test DB terisolasi), LEADER aktif
      // LAIN dinonaktifkan sementara — cookie sesi tetap valid karena
      // authenticate hanya memverifikasi JWT, bukan re-cek kolom aktif
      // per request (lihat auth.middleware.js) — lalu dikembalikan di
      // blok finally supaya tidak meninggalkan efek samping permanen.
      const pool = getPool();
      const [otherActiveLeaders] = await pool.query(
        "SELECT id FROM users WHERE peran = 'LEADER' AND aktif = TRUE AND id != :id",
        { id: soleLeaderUserId }
      );
      const otherIds = otherActiveLeaders.map((r) => r.id);

      try {
        if (otherIds.length > 0) {
          await pool.query('UPDATE users SET aktif = FALSE WHERE id IN (:ids)', { ids: otherIds });
        }

        const res = await request(server)
          .patch(`/api/users/${soleLeaderUserId}/status`)
          .set('Cookie', cookieLeader)
          .send({ aktif: false });

        expect(res.status).toBe(400);
      } finally {
        if (otherIds.length > 0) {
          await pool.query('UPDATE users SET aktif = TRUE WHERE id IN (:ids)', { ids: otherIds });
        }
      }
    }, 15000);
  });
});
