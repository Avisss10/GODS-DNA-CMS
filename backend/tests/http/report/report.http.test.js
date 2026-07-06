require('dotenv').config();
const request = require('supertest');
const ExcelJS = require('exceljs');
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

describeIfReady('Report Endpoints — REST HTTP Test (server aktif)', () => {
  let server;
  let cookieAdmin;
  let adminUserId;

  const adminUsername = `test_http_report_admin_${Date.now()}`;
  const testPassword = 'PasswordReportHttp123!';

  beforeAll(async () => {
    await ensureTablesExist();
    const pool = getPool();

    const hash = await hashPassword(testPassword);
    adminUserId = await authRepository.createUser({
      username: adminUsername, passwordHash: hash, peran: 'ADMIN',
    });

    server = startServer(0);
    await new Promise((resolve) => server.on('listening', resolve));

    const loginRes = await request(server)
      .post('/api/auth/login')
      .send({ username: adminUsername, password: testPassword });
    cookieAdmin = loginRes.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
  }, 30000);

  afterAll(async () => {
    const pool = getPool();
    if (adminUserId) await pool.query('DELETE FROM users WHERE id = :id', { id: adminUserId });
    await pool.query("DELETE FROM audit_logs WHERE modul IN ('LAPORAN','AUTH')");

    const redis = getRedisClient();
    await redis.del(`active_session:${adminUserId}`);
    await redis.del(`refresh_token:${adminUserId}`);

    await new Promise((resolve) => server.close(resolve));
    await closeRedis();
    await closePool();
  }, 30000);

  // ── GET /api/reports/jemaat ───────────────────────────────────
  describe('GET /api/reports/jemaat', () => {
    it('401 tanpa autentikasi', async () => {
      const res = await request(server).get('/api/reports/jemaat');
      expect(res.status).toBe(401);
    });

    it('200 dan mengirim file .xlsx (default format) berisi jumlah kolom sesuai jemaat', async () => {
      const res = await request(server)
        .get('/api/reports/jemaat')
        .set('Cookie', cookieAdmin)
        .buffer(true)
        .parse((response, callback) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      expect(res.headers['content-disposition']).toMatch(/\.xlsx"/);

      // Report jemaat SELALU menyertakan kolom sensitif terdekripsi
      // (tidak ada lagi mode ?sensitive)
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(res.body);
      const headers = workbook.worksheets[0].getRow(1).values
        .filter((v) => v !== undefined && v !== null);
      expect(headers).toContain('No HP');
      expect(headers).toContain('Alamat');
      expect(headers).toContain('Media Sosial');
    });

    it('200 dan mengirim file .pdf saat format=pdf', async () => {
      const res = await request(server)
        .get('/api/reports/jemaat?format=pdf')
        .set('Cookie', cookieAdmin)
        .buffer(true)
        .parse((response, callback) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });

    it('400 jika format tidak valid', async () => {
      const res = await request(server)
        .get('/api/reports/jemaat?format=csv')
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/reports/event ────────────────────────────────────
  describe('GET /api/reports/event', () => {
    it('401 tanpa autentikasi', async () => {
      const res = await request(server).get('/api/reports/event');
      expect(res.status).toBe(401);
    });

    it('200 berhasil generate laporan kehadiran event (default xlsx)', async () => {
      const res = await request(server)
        .get('/api/reports/event')
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
    });
  });

  // ── GET /api/reports/cg ───────────────────────────────────────
  describe('GET /api/reports/cg', () => {
    it('200 berhasil generate laporan kehadiran CG', async () => {
      const res = await request(server)
        .get('/api/reports/cg')
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
    });
  });

  // ── GET /api/reports/volunteer ────────────────────────────────
  describe('GET /api/reports/volunteer', () => {
    it('200 berhasil generate laporan volunteer', async () => {
      const res = await request(server)
        .get('/api/reports/volunteer')
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
    });
  });

  // ── GET /api/reports/analytics ────────────────────────────────
  describe('GET /api/reports/analytics', () => {
    it('200 berhasil generate laporan analytics', async () => {
      const res = await request(server)
        .get('/api/reports/analytics')
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
    });
  });

  // ── GET /api/reports/download/:token ─────────────────────────
  describe('GET /api/reports/download/:token', () => {
    it('404 token tidak valid', async () => {
      const res = await request(server)
        .get('/api/reports/download/invalid-token-xyz');
      expect(res.status).toBe(404);
    });

    it('404 token sudah kadaluarsa atau tidak ada', async () => {
      const res = await request(server)
        .get('/api/reports/download/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
    });
  });
});
