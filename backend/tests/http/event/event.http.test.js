require('dotenv').config();
const request = require('supertest');
const { startServer } = require('../../../src/server');
const { getPool, closePool } = require('../../../src/config/database');
const { closeRedis, getRedisClient } = require('../../../src/config/redis');
const { hashPassword } = require('../../../src/utils/password.util');
const authRepository = require('../../../src/modules/auth/auth.repository');
const jemaatRepository = require('../../../src/modules/jemaat/jemaat.repository');
const volunteerService = require('../../../src/modules/volunteer/volunteer.service');
const { ensureTablesExist } = require('../../helpers/ensure-tables');

const hasFullConfig =
  !!process.env.DB_HOST && !!process.env.DB_USER && !!process.env.DB_NAME &&
  !!process.env.REDIS_HOST && !!process.env.AES_ENCRYPTION_KEY && !!process.env.AUDIT_HMAC_SECRET;

const describeIfReady = hasFullConfig ? describe : describe.skip;

describeIfReady('Event Endpoints — REST HTTP Test (server aktif)', () => {
  let server, cookieAdmin, adminUserId, jemaatId, jemaatId2, volunteerTypeId, eventId;

  const adminUsername = `test_http_event_admin_${Date.now()}`;
  const testPassword = 'PasswordEventHttp123!';

  beforeAll(async () => {
    await ensureTablesExist();
    const pool = getPool();

    const hash = await hashPassword(testPassword);
    adminUserId = await authRepository.createUser({
      username: adminUsername, passwordHash: hash, peran: 'ADMIN',
    });

    jemaatId = await jemaatRepository.create({
      nama: `Event HTTP Jemaat ${Date.now()}`,
      tgl_lahir: '1990-06-01', jenis_kelamin: 'L', tgl_bergabung: '2024-01-01',
    });

    jemaatId2 = await jemaatRepository.create({
      nama: `Event HTTP Jemaat Dua ${Date.now()}`,
      tgl_lahir: '1991-06-01', jenis_kelamin: 'P', tgl_bergabung: '2024-01-01',
    });

    const vt = await volunteerService.createVolunteerType(
      { nama: `EventHTTPVol ${Date.now()}` }, { actorUserId: adminUserId }
    );
    volunteerTypeId = vt.id;
    await volunteerService.registerVolunteer(jemaatId, volunteerTypeId, { actorUserId: adminUserId });
    await volunteerService.registerVolunteer(jemaatId2, volunteerTypeId, { actorUserId: adminUserId });

    server = startServer(0);
    await new Promise((resolve) => server.on('listening', resolve));

    const loginRes = await request(server)
      .post('/api/auth/login')
      .send({ username: adminUsername, password: testPassword });
    cookieAdmin = loginRes.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
  }, 30000);

  afterAll(async () => {
    const pool = getPool();
    if (eventId) {
      await pool.query('DELETE FROM event_attendances WHERE event_id = :id', { id: eventId });
      await pool.query('DELETE FROM event_volunteer WHERE event_id = :id', { id: eventId });
      await pool.query('DELETE FROM event_volunteer_needs WHERE event_id = :id', { id: eventId });
      await pool.query('DELETE FROM event_kehadiran WHERE event_id = :id', { id: eventId });
      await pool.query('DELETE FROM event WHERE id = :id', { id: eventId });
    }
    if (volunteerTypeId) {
      await pool.query('DELETE FROM volunteer_members WHERE volunteer_type_id = :id', { id: volunteerTypeId });
      await pool.query('DELETE FROM volunteer_jenis WHERE id = :id', { id: volunteerTypeId });
    }
    if (jemaatId) await pool.query('DELETE FROM jemaat WHERE id = :id', { id: jemaatId });
    if (jemaatId2) await pool.query('DELETE FROM jemaat WHERE id = :id', { id: jemaatId2 });
    if (adminUserId) await pool.query('DELETE FROM users WHERE id = :id', { id: adminUserId });
    await pool.query("DELETE FROM audit_logs WHERE modul IN ('EVENT','EVENT_KEHADIRAN','VOLUNTEER','AUTH')");

    const redis = getRedisClient();
    await redis.del(`active_session:${adminUserId}`);
    await redis.del(`refresh_token:${adminUserId}`);

    await new Promise((resolve) => server.close(resolve));
    await closeRedis();
    await closePool();
  }, 30000);

  describe('POST /api/events', () => {
    it('401 tanpa autentikasi', async () => {
      const res = await request(server).post('/api/events').send({
        judul: 'Test', jenis: 'IBADAH',
        waktu_mulai: '2026-12-25 09:00:00', waktu_selesai: '2026-12-25 11:00:00',
      });
      expect(res.status).toBe(401);
    });

    it('400 judul kosong', async () => {
      const res = await request(server).post('/api/events').set('Cookie', cookieAdmin)
        .send({ jenis: 'IBADAH', waktu_mulai: '2026-12-25 09:00:00', waktu_selesai: '2026-12-25 11:00:00' });
      expect(res.status).toBe(400);
    });

    it('400 waktu_selesai sebelum waktu_mulai', async () => {
      const res = await request(server).post('/api/events').set('Cookie', cookieAdmin)
        .send({ judul: 'Test', jenis: 'IBADAH', waktu_mulai: '2026-12-25 11:00:00', waktu_selesai: '2026-12-25 09:00:00' });
      expect(res.status).toBe(400);
    });

    it('201 berhasil buat event berstatus DRAFT', async () => {
      const res = await request(server).post('/api/events').set('Cookie', cookieAdmin)
        .send({
          judul: `Ibadah Raya HTTP ${Date.now()}`, jenis: 'IBADAH',
          waktu_mulai: '2026-12-25 09:00:00', waktu_selesai: '2026-12-25 11:00:00',
        });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('DRAFT');
      eventId = res.body.id;
    });
  });

  describe('GET /api/events', () => {
    it('401 tanpa autentikasi', async () => {
      expect((await request(server).get('/api/events')).status).toBe(401);
    });

    it('200 mengembalikan array event', async () => {
      const res = await request(server).get('/api/events').set('Cookie', cookieAdmin);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('200 filter by status DRAFT', async () => {
      const res = await request(server).get('/api/events?status=DRAFT').set('Cookie', cookieAdmin);
      expect(res.status).toBe(200);
      res.body.forEach((e) => expect(e.status).toBe('DRAFT'));
    });
  });

  describe('GET /api/events/:id', () => {
    it('200 berhasil ambil event by id', async () => {
      const res = await request(server).get(`/api/events/${eventId}`).set('Cookie', cookieAdmin);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(eventId);
    });

    it('404 id tidak ditemukan', async () => {
      const res = await request(server).get('/api/events/999999').set('Cookie', cookieAdmin);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/events/:id', () => {
    it('200 berhasil update event DRAFT', async () => {
      const res = await request(server).put(`/api/events/${eventId}`)
        .set('Cookie', cookieAdmin).send({ deskripsi: 'Ibadah akhir tahun' });
      expect(res.status).toBe(200);
      expect(res.body.deskripsi).toBe('Ibadah akhir tahun');
    });

    it('404 event tidak ditemukan', async () => {
      const res = await request(server).put('/api/events/999999')
        .set('Cookie', cookieAdmin).send({ deskripsi: 'Apapun' });
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/events/:id/status', () => {
    it('400 status tidak dikirim', async () => {
      const res = await request(server).patch(`/api/events/${eventId}/status`)
        .set('Cookie', cookieAdmin).send({});
      expect(res.status).toBe(400);
    });

    it('400 transisi tidak valid (DRAFT → AKTIF)', async () => {
      const res = await request(server).patch(`/api/events/${eventId}/status`)
        .set('Cookie', cookieAdmin).send({ status: 'AKTIF' });
      expect(res.status).toBe(400);
    });

    it('200 DRAFT → PUBLISHED berhasil', async () => {
      const res = await request(server).patch(`/api/events/${eventId}/status`)
        .set('Cookie', cookieAdmin).send({ status: 'PUBLISHED' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('PUBLISHED');
    });

    it('200 PUBLISHED → AKTIF membuka absensi_status', async () => {
      const res = await request(server).patch(`/api/events/${eventId}/status`)
        .set('Cookie', cookieAdmin).send({ status: 'AKTIF' });
      expect(res.status).toBe(200);
      expect(res.body.absensi_status).toBe('OPEN');
    });
  });

  describe('POST /api/events/:id/kehadiran', () => {
    it('400 total_hadir tidak dikirim', async () => {
      const res = await request(server).post(`/api/events/${eventId}/kehadiran`)
        .set('Cookie', cookieAdmin).send({ jemaat_baru: 5 });
      expect(res.status).toBe(400);
    });

    it('400 jemaat_baru melebihi total_hadir', async () => {
      const res = await request(server).post(`/api/events/${eventId}/kehadiran`)
        .set('Cookie', cookieAdmin).send({ total_hadir: 10, jemaat_baru: 20 });
      expect(res.status).toBe(400);
    });

    it('200 berhasil input kehadiran', async () => {
      const res = await request(server).post(`/api/events/${eventId}/kehadiran`)
        .set('Cookie', cookieAdmin).send({ total_hadir: 200, jemaat_baru: 15 });
      expect(res.status).toBe(200);
      expect(res.body.total_hadir).toBe(200);
    });
  });

  describe('GET /api/events/:id/kehadiran', () => {
    it('200 mengembalikan data event_kehadiran yang sudah diinput', async () => {
      const res = await request(server).get(`/api/events/${eventId}/kehadiran`)
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(200);
      expect(res.body.event_id).toBe(eventId);
      expect(res.body.total_hadir).toBe(200);
      expect(res.body.jemaat_baru).toBe(15);
    });

    it('404 event tidak ditemukan', async () => {
      const res = await request(server).get('/api/events/999999/kehadiran')
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(404);
    });

    it('401 tanpa autentikasi', async () => {
      const res = await request(server).get(`/api/events/${eventId}/kehadiran`);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/events/:id/volunteers', () => {
    it('200 mengembalikan array (kosong saat belum ada penugasan)', async () => {
      const res = await request(server).get(`/api/events/${eventId}/volunteers`)
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('404 event tidak ditemukan', async () => {
      const res = await request(server).get('/api/events/999999/volunteers')
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/events/:id/volunteers', () => {
    it('400 jemaat tidak terdaftar sebagai volunteer jenis ini', async () => {
      const res = await request(server).post(`/api/events/${eventId}/volunteers`)
        .set('Cookie', cookieAdmin).send({ jemaat_id: jemaatId, jenis_id: 999999 });
      expect(res.status).toBe(400);
    });

    it('201 berhasil tugaskan volunteer', async () => {
      const res = await request(server).post(`/api/events/${eventId}/volunteers`)
        .set('Cookie', cookieAdmin).send({ jemaat_id: jemaatId, jenis_id: volunteerTypeId });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('AKTIF');
    });
  });

  // ── Volunteer needs (kuota) — siklus end-to-end ────────────────
  // Prasyarat dari describe sebelumnya: event AKTIF dan jemaatId
  // sudah ditugaskan (1 penugasan AKTIF pada volunteerTypeId).
  describe('GET & PUT /api/events/:id/volunteer-needs (siklus kuota)', () => {
    it('GET 401 tanpa autentikasi', async () => {
      const res = await request(server).get(`/api/events/${eventId}/volunteer-needs`);
      expect(res.status).toBe(401);
    });

    it('GET 404 event tidak ditemukan', async () => {
      const res = await request(server).get('/api/events/999999/volunteer-needs')
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(404);
    });

    it('GET 200 array kosong saat belum ada baris kebutuhan', async () => {
      const res = await request(server).get(`/api/events/${eventId}/volunteer-needs`)
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('PUT 400 jika kuota bukan integer >= 1', async () => {
      const res = await request(server).put(`/api/events/${eventId}/volunteer-needs`)
        .set('Cookie', cookieAdmin)
        .send({ needs: [{ jenis_id: volunteerTypeId, kuota: 0 }] });
      expect(res.status).toBe(400);
    });

    it('PUT 400 jika jenis_id tidak merujuk jenis volunteer aktif', async () => {
      const res = await request(server).put(`/api/events/${eventId}/volunteer-needs`)
        .set('Cookie', cookieAdmin)
        .send({ needs: [{ jenis_id: 999999, kuota: 2 }] });
      expect(res.status).toBe(400);
    });

    it('PUT 200 set kuota 1 — respons menampilkan terisi 1 dari kuota 1', async () => {
      const res = await request(server).put(`/api/events/${eventId}/volunteer-needs`)
        .set('Cookie', cookieAdmin)
        .send({ needs: [{ jenis_id: volunteerTypeId, kuota: 1 }] });

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        volunteer_type_id: volunteerTypeId,
        kuota: 1,
        jumlah_terisi: 1,
      });
      expect(res.body[0].nama_jenis).toBeDefined();
    });

    it('POST assign jemaat kedua 409 — kuota dari endpoint baru membatasi assignVolunteer', async () => {
      const res = await request(server).post(`/api/events/${eventId}/volunteers`)
        .set('Cookie', cookieAdmin)
        .send({ jemaat_id: jemaatId2, jenis_id: volunteerTypeId });
      expect(res.status).toBe(409);
    });

    it('PUT 200 naikkan kuota ke 2', async () => {
      const res = await request(server).put(`/api/events/${eventId}/volunteer-needs`)
        .set('Cookie', cookieAdmin)
        .send({ needs: [{ jenis_id: volunteerTypeId, kuota: 2 }] });
      expect(res.status).toBe(200);
      expect(res.body[0].kuota).toBe(2);
    });

    it('POST assign jemaat kedua kini 201 — kuota baru berlaku', async () => {
      const res = await request(server).post(`/api/events/${eventId}/volunteers`)
        .set('Cookie', cookieAdmin)
        .send({ jemaat_id: jemaatId2, jenis_id: volunteerTypeId });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('AKTIF');
    });

    it('PUT 409 turunkan kuota ke 1 di bawah 2 penugasan aktif — pesan menyebut angka', async () => {
      const res = await request(server).put(`/api/events/${eventId}/volunteer-needs`)
        .set('Cookie', cookieAdmin)
        .send({ needs: [{ jenis_id: volunteerTypeId, kuota: 1 }] });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('penugasan aktif');
      expect(res.body.message).toContain('(2)');
    });

    it('PUT 409 body tanpa jenis tersebut (hapus baris) ditolak selama masih ada penugasan aktif', async () => {
      const res = await request(server).put(`/api/events/${eventId}/volunteer-needs`)
        .set('Cookie', cookieAdmin)
        .send({ needs: [] });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('tidak dapat dihapus');
    });

    it('GET 200 kondisi akhir: kuota 2, jumlah_terisi 2', async () => {
      const res = await request(server).get(`/api/events/${eventId}/volunteer-needs`)
        .set('Cookie', cookieAdmin);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({
        volunteer_type_id: volunteerTypeId,
        kuota: 2,
        jumlah_terisi: 2,
      });
    });
  });

  describe('GET /api/events/:id/suggest-volunteers/:jenisId', () => {
    it('200 mengembalikan array kandidat', async () => {
      const res = await request(server)
        .get(`/api/events/${eventId}/suggest-volunteers/${volunteerTypeId}`)
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('404 event tidak ditemukan', async () => {
      const res = await request(server)
        .get(`/api/events/999999/suggest-volunteers/${volunteerTypeId}`)
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/volunteer-types/:id/members', () => {
    it('200 mengembalikan daftar member aktif', async () => {
      const res = await request(server)
        .get(`/api/volunteer-types/${volunteerTypeId}/members`)
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('404 jenis volunteer tidak ditemukan', async () => {
      const res = await request(server)
        .get('/api/volunteer-types/999999/members')
        .set('Cookie', cookieAdmin);
      expect(res.status).toBe(404);
    });
  });

  describe('Transisi akhir AKTIF → SELESAI', () => {
    it('200 AKTIF → SELESAI menutup absensi_status', async () => {
      const res = await request(server).patch(`/api/events/${eventId}/status`)
        .set('Cookie', cookieAdmin).send({ status: 'SELESAI' });
      expect(res.status).toBe(200);
      expect(res.body.absensi_status).toBe('CLOSED');
    });

    it('PUT volunteer-needs 409 setelah event SELESAI (di luar DRAFT/PUBLISHED/AKTIF)', async () => {
      const res = await request(server).put(`/api/events/${eventId}/volunteer-needs`)
        .set('Cookie', cookieAdmin)
        .send({ needs: [{ jenis_id: volunteerTypeId, kuota: 5 }] });
      expect(res.status).toBe(409);
    });
  });
});