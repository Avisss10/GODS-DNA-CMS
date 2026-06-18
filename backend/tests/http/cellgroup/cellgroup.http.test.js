require('dotenv').config();
const request = require('supertest');
const sharp = require('sharp');
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

describeIfReady('Cell Group Endpoints — REST HTTP Test (server aktif)', () => {
  let server;
  let cookieHeader;
  let leaderId, memberId, cgId, meetingId;

  const testUsername = `test_http_cg_${Date.now()}`;
  const testPassword = 'PasswordCgHttp123!';
  let testUserId;

  beforeAll(async () => {
    await ensureTablesExist();

    leaderId = await jemaatRepository.create({
      nama: `Leader HTTP Test ${Date.now()}`, tgl_lahir: '1985-01-01',
      jenis_kelamin: 'L', tgl_bergabung: '2020-01-01',
    });
    memberId = await jemaatRepository.create({
      nama: `Member HTTP Test ${Date.now()}`, tgl_lahir: '1995-01-01',
      jenis_kelamin: 'P', tgl_bergabung: '2026-01-01',
    });

    const passwordHash = await hashPassword(testPassword);
    testUserId = await authRepository.createUser({
      username: testUsername, passwordHash, peran: 'ADMIN',
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
    if (meetingId) {
      await pool.query('DELETE FROM cg_absensi WHERE meeting_id = :id', { id: meetingId });
      await pool.query('DELETE FROM cg_meeting_photos WHERE meeting_id = :id', { id: meetingId });
      await pool.query('DELETE FROM cg_meeting WHERE id = :id', { id: meetingId });
    }
    if (cgId) {
      await pool.query('DELETE FROM cell_group_members WHERE cg_id = :id', { id: cgId });
      await pool.query('DELETE FROM cell_group WHERE id = :id', { id: cgId });
    }
    await pool.query('DELETE FROM jemaat WHERE id IN (:leaderId, :memberId)', { leaderId, memberId });
    await pool.query('DELETE FROM users WHERE id = :id', { id: testUserId });
    await pool.query('DELETE FROM audit_logs WHERE modul IN (:m1, :m2)', { m1: 'CELL_GROUP', m2: 'AUTH' });

    const redis = getRedisClient();
    await redis.del(`active_session:${testUserId}`);
    await redis.del(`refresh_token:${testUserId}`);

    await new Promise((resolve) => server.close(resolve));
    await closeRedis();
    await closePool();
  }, 30000);

  it('POST /api/cell-groups harus 401 tanpa cookie sesi', async () => {
    const res = await request(server).post('/api/cell-groups').send({ nama: 'Tanpa Auth', leaderId });
    expect(res.status).toBe(401);
  }, 10000);

  it('POST /api/cell-groups harus 201 dan mengembalikan id', async () => {
    const res = await request(server)
      .post('/api/cell-groups')
      .set('Cookie', cookieHeader)
      .send({ nama: 'CG HTTP Test', leaderId });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    cgId = res.body.id;
  }, 15000);

  it('GET /api/cell-groups/:id harus mengembalikan detail CG', async () => {
    const res = await request(server)
      .get(`/api/cell-groups/${cgId}`)
      .set('Cookie', cookieHeader);

    expect(res.status).toBe(200);
    expect(res.body.nama).toBe('CG HTTP Test');
  }, 10000);

  it('GET /api/cell-groups/:id/members harus mengembalikan leader sebagai anggota', async () => {
    const res = await request(server)
      .get(`/api/cell-groups/${cgId}/members`)
      .set('Cookie', cookieHeader);

    expect(res.status).toBe(200);
    expect(res.body.some((m) => m.id === leaderId)).toBe(true);
  }, 10000);

  it('POST /api/cell-groups/:id/members harus berhasil menambah anggota baru', async () => {
    const res = await request(server)
      .post(`/api/cell-groups/${cgId}/members`)
      .set('Cookie', cookieHeader)
      .send({ jemaatId: memberId });

    expect(res.status).toBe(201);
  }, 10000);

  it('POST /api/cell-groups/:id/members harus 409 jika anggota sudah ada', async () => {
    const res = await request(server)
      .post(`/api/cell-groups/${cgId}/members`)
      .set('Cookie', cookieHeader)
      .send({ jemaatId: memberId });

    expect(res.status).toBe(409);
  }, 10000);

  it('POST /api/cell-groups/:id/meetings harus 201 karena CG punya leader aktif', async () => {
    const res = await request(server)
      .post(`/api/cell-groups/${cgId}/meetings`)
      .set('Cookie', cookieHeader)
      .send({
        judul: 'Meeting HTTP Test', jenis: 'OFFLINE',
        waktuMulai: '2026-06-20 19:00:00', waktuSelesai: '2026-06-20 21:00:00',
      });

    expect(res.status).toBe(201);
    meetingId = res.body.id;
  }, 15000);

  it('GET /api/cell-groups/meetings/:meetingId harus mengembalikan detail meeting', async () => {
    const res = await request(server)
      .get(`/api/cell-groups/meetings/${meetingId}`)
      .set('Cookie', cookieHeader);

    expect(res.status).toBe(200);
    expect(res.body.judul).toBe('Meeting HTTP Test');
  }, 10000);

  it('POST /api/cell-groups/meetings/:meetingId/photos harus 400 tanpa file', async () => {
    const res = await request(server)
      .post(`/api/cell-groups/meetings/${meetingId}/photos`)
      .set('Cookie', cookieHeader);

    expect(res.status).toBe(400);
  }, 10000);

  it('POST /api/cell-groups/meetings/:meetingId/photos harus 201 dan mengompres foto', async () => {
    const imageBuffer = await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: { r: 90, g: 130, b: 170 } },
    }).jpeg({ quality: 100 }).toBuffer();

    const res = await request(server)
      .post(`/api/cell-groups/meetings/${meetingId}/photos`)
      .set('Cookie', cookieHeader)
      .attach('photo', imageBuffer, 'test.jpg');

    expect(res.status).toBe(201);
    expect(res.body.sizeKb).toBeLessThanOrEqual(500);
  }, 30000);

  it('GET /api/cell-groups/meetings/:meetingId/active-members harus mengembalikan leader dan member', async () => {
    const res = await request(server)
      .get(`/api/cell-groups/meetings/${meetingId}/active-members`)
      .set('Cookie', cookieHeader);

    expect(res.status).toBe(200);
    expect(res.body.some((m) => m.id === leaderId)).toBe(true);
    expect(res.body.some((m) => m.id === memberId)).toBe(true);
  }, 10000);

  it('POST /api/cell-groups/meetings/:meetingId/absensi harus 200 dan menyimpan absensi', async () => {
    const res = await request(server)
      .post(`/api/cell-groups/meetings/${meetingId}/absensi`)
      .set('Cookie', cookieHeader)
      .send({
        absensi: [
          { jemaatId: leaderId, hadir: true },
          { jemaatId: memberId, hadir: false },
        ],
      });

    expect(res.status).toBe(200);
  }, 10000);

  it('DELETE /api/cell-groups/:id/members/:jemaatId harus berhasil mengeluarkan anggota', async () => {
    const res = await request(server)
      .delete(`/api/cell-groups/${cgId}/members/${memberId}`)
      .set('Cookie', cookieHeader);

    expect(res.status).toBe(200);

    const membersRes = await request(server)
      .get(`/api/cell-groups/${cgId}/members`)
      .set('Cookie', cookieHeader);
    expect(membersRes.body.some((m) => m.id === memberId)).toBe(false);
  }, 10000);
});

if (!hasFullConfig) {
  describe('Cell Group Endpoints — REST HTTP Test', () => {
    it.skip('di-skip: konfigurasi belum lengkap di .env', () => {});
  });
}