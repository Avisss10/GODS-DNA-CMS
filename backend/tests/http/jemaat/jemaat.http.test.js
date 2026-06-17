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

describeIfReady('Jemaat Endpoints — REST HTTP Test (server aktif)', () => {
  let server;
  let cookieHeader;
  let createdJemaatId;

  const testUsername = `test_http_jemaat_${Date.now()}`;
  const testPassword = 'PasswordJemaatHttp123!';
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

    const loginRes = await request(server)
      .post('/api/auth/login')
      .send({ username: testUsername, password: testPassword });

    const cookies = loginRes.headers['set-cookie'];
    cookieHeader = cookies.map((c) => c.split(';')[0]).join('; ');
  }, 30000);

  afterAll(async () => {
    const pool = getPool();
    if (createdJemaatId) {
      await pool.query('DELETE FROM jemaat WHERE id = :id', { id: createdJemaatId });
      await pool.query('DELETE FROM audit_logs WHERE object_id = :id AND modul = :modul', {
        id: createdJemaatId, modul: 'JEMAAT',
      });
    }
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

  it('POST /api/jemaat harus 401 tanpa cookie sesi', async () => {
    const res = await request(server).post('/api/jemaat').send({
      nama: 'Tanpa Auth', tgl_lahir: '1990-01-01', jenis_kelamin: 'L', tgl_bergabung: '2026-01-01',
    });

    expect(res.status).toBe(401);
  }, 10000);

  it('POST /api/jemaat harus 201 dan mengembalikan id untuk data valid tanpa duplikat', async () => {
    const res = await request(server)
      .post('/api/jemaat')
      .set('Cookie', cookieHeader)
      .send({
        nama: `Test HTTP Jemaat ${Date.now()}`,
        tgl_lahir: '1993-07-20',
        jenis_kelamin: 'L',
        no_hp: `0814${Date.now().toString().slice(-8)}`,
        tgl_bergabung: '2026-06-01',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    createdJemaatId = res.body.id;
  }, 15000);

  it('POST /api/jemaat harus 400 jika field wajib kosong', async () => {
    const res = await request(server)
      .post('/api/jemaat')
      .set('Cookie', cookieHeader)
      .send({ nama: 'Tanpa Tanggal Lahir' });

    expect(res.status).toBe(400);
  }, 10000);

  it('POST /api/jemaat harus 409 dengan detail duplicates jika nama+tgl_lahir sama', async () => {
    const getRes = await request(server)
      .get(`/api/jemaat/${createdJemaatId}`)
      .set('Cookie', cookieHeader);

    const existingNama = getRes.body.nama;
    const existingTglLahir = getRes.body.tgl_lahir.slice(0, 10);

    const res = await request(server)
      .post('/api/jemaat')
      .set('Cookie', cookieHeader)
      .send({
        nama: existingNama,
        tgl_lahir: existingTglLahir,
        jenis_kelamin: 'L',
        tgl_bergabung: '2026-06-01',
      });

    expect(res.status).toBe(409);
    expect(res.body.duplicates).toBeDefined();
  }, 15000);

  it('GET /api/jemaat/:id harus mengembalikan data dengan no_hp dalam bentuk ciphertext', async () => {
    const res = await request(server)
      .get(`/api/jemaat/${createdJemaatId}`)
      .set('Cookie', cookieHeader);

    expect(res.status).toBe(200);
    expect(res.body.no_hp).not.toMatch(/^0814/);
  }, 10000);

  it('GET /api/jemaat/:id harus 404 untuk id yang tidak ada', async () => {
    const res = await request(server)
      .get('/api/jemaat/9999999')
      .set('Cookie', cookieHeader);

    expect(res.status).toBe(404);
  }, 10000);

  it('GET /api/jemaat/:id/sensitive/no_hp harus mengembalikan plaintext', async () => {
    const res = await request(server)
      .get(`/api/jemaat/${createdJemaatId}/sensitive/no_hp`)
      .set('Cookie', cookieHeader);

    expect(res.status).toBe(200);
    expect(res.body.value).toMatch(/^0814/);
  }, 10000);

  it('GET /api/jemaat/:id/sensitive/nama harus 400 (field tidak valid)', async () => {
    const res = await request(server)
      .get(`/api/jemaat/${createdJemaatId}/sensitive/nama`)
      .set('Cookie', cookieHeader);

    expect(res.status).toBe(400);
  }, 10000);

  it('PUT /api/jemaat/:id harus berhasil update nama', async () => {
    const res = await request(server)
      .put(`/api/jemaat/${createdJemaatId}`)
      .set('Cookie', cookieHeader)
      .send({ nama: 'Nama Sudah Diupdate via HTTP' });

    expect(res.status).toBe(200);
    expect(res.body.nama).toBe('Nama Sudah Diupdate via HTTP');
  }, 10000);

  it('PUT /api/jemaat/:id harus 404 untuk id yang tidak ada', async () => {
    const res = await request(server)
      .put('/api/jemaat/9999999')
      .set('Cookie', cookieHeader)
      .send({ nama: 'Apapun' });

    expect(res.status).toBe(404);
  }, 10000);

  it('DELETE /api/jemaat/:id harus berhasil soft delete (tanpa dependensi)', async () => {
    const res = await request(server)
      .delete(`/api/jemaat/${createdJemaatId}`)
      .set('Cookie', cookieHeader);

    expect(res.status).toBe(200);

    const getRes = await request(server)
      .get(`/api/jemaat/${createdJemaatId}`)
      .set('Cookie', cookieHeader);
    expect(getRes.status).toBe(404);
  }, 10000);
});

if (!hasFullConfig) {
  describe('Jemaat Endpoints — REST HTTP Test', () => {
    it.skip('di-skip: konfigurasi belum lengkap di .env', () => {});
  });
}