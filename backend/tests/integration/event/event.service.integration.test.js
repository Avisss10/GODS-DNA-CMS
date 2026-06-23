require('dotenv').config();
const { getPool, closePool } = require('../../../src/config/database');
const jemaatRepository = require('../../../src/modules/jemaat/jemaat.repository');
const volunteerService = require('../../../src/modules/volunteer/volunteer.service');
const eventService = require('../../../src/modules/event/event.service');
const authRepository = require('../../../src/modules/auth/auth.repository');
const { hashPassword } = require('../../../src/utils/password.util');
const { ensureTablesExist } = require('../../helpers/ensure-tables');

const hasFullConfig =
  !!process.env.DB_HOST && !!process.env.DB_USER && !!process.env.DB_NAME &&
  !!process.env.AES_ENCRYPTION_KEY && !!process.env.AUDIT_HMAC_SECRET;

const describeIfReady = hasFullConfig ? describe : describe.skip;

describeIfReady('event.service — Integration Test (TiDB nyata)', () => {
  let pool, userId, jemaatId, volunteerTypeId, eventId;

  beforeAll(async () => {
    await ensureTablesExist();
    pool = getPool();

    const hash = await hashPassword('Password123!');
    userId = await authRepository.createUser({
      username: `event_svc_test_${Date.now()}`,
      passwordHash: hash, peran: 'ADMIN',
    });

    jemaatId = await jemaatRepository.create({
      nama: `Event Service Test ${Date.now()}`,
      tgl_lahir: '1990-01-01', jenis_kelamin: 'L', tgl_bergabung: '2024-01-01',
    });

    const vt = await volunteerService.createVolunteerType(
      { nama: `EventSvcVol ${Date.now()}` }, { actorUserId: userId }
    );
    volunteerTypeId = vt.id;
    await volunteerService.registerVolunteer(jemaatId, volunteerTypeId, { actorUserId: userId });
  }, 30000);

  afterAll(async () => {
    if (eventId) {
      await pool.query('DELETE FROM event_attendances WHERE event_id = :id', { id: eventId }); // ← TAMBAH
      await pool.query('DELETE FROM event_volunteer WHERE event_id = :id', { id: eventId });
      await pool.query('DELETE FROM event_kehadiran WHERE event_id = :id', { id: eventId });
      await pool.query('DELETE FROM event WHERE id = :id', { id: eventId });
    }
    if (volunteerTypeId) {
      await pool.query('DELETE FROM volunteer_members WHERE volunteer_type_id = :id', { id: volunteerTypeId });
      await pool.query('DELETE FROM volunteer_jenis WHERE id = :id', { id: volunteerTypeId });
    }
    if (jemaatId) await pool.query('DELETE FROM jemaat WHERE id = :id', { id: jemaatId });
    if (userId) await pool.query('DELETE FROM users WHERE id = :id', { id: userId });
    await pool.query("DELETE FROM audit_logs WHERE modul IN ('EVENT','EVENT_KEHADIRAN','VOLUNTEER','AUTH')");
    await closePool();
  }, 30000);

  it('createEvent harus membuat event berstatus DRAFT', async () => {
    const result = await eventService.createEvent({
      judul: `Ibadah Raya Test ${Date.now()}`, jenis: 'IBADAH',
      waktu_mulai: '2026-12-01 09:00:00', waktu_selesai: '2026-12-01 11:00:00',
    }, { actorUserId: userId });

    eventId = result.id;
    expect(typeof eventId).toBe('number');
    expect(result.status).toBe('DRAFT');
  }, 15000);

  it('createEvent harus 400 jika waktu_selesai sebelum waktu_mulai', async () => {
    await expect(eventService.createEvent({
      judul: 'Salah Waktu', jenis: 'IBADAH',
      waktu_mulai: '2026-12-01 11:00:00', waktu_selesai: '2026-12-01 09:00:00',
    }, { actorUserId: userId })).rejects.toMatchObject({ statusCode: 400 });
  }, 15000);

  it('transitionStatus DRAFT → PUBLISHED harus berhasil', async () => {
    const result = await eventService.transitionStatus(eventId, 'PUBLISHED', { actorUserId: userId });
    expect(result.status).toBe('PUBLISHED');
  }, 15000);

  it('transitionStatus PUBLISHED → AKTIF harus membuka absensi_status', async () => {
    const result = await eventService.transitionStatus(eventId, 'AKTIF', { actorUserId: userId });
    expect(result.status).toBe('AKTIF');
    expect(result.absensi_status).toBe('OPEN');
  }, 15000);

  it('inputKehadiran harus berhasil saat event AKTIF', async () => {
    const result = await eventService.inputKehadiran(
      eventId, { total_hadir: 150, jemaat_baru: 10 }, { actorUserId: userId }
    );
    expect(result.total_hadir).toBe(150);
    expect(result.jemaat_baru).toBe(10);
  }, 15000);

  it('assignVolunteer harus berhasil untuk jemaat yang terdaftar', async () => {
    const result = await eventService.assignVolunteer(
      eventId, { jemaat_id: jemaatId, jenis_id: volunteerTypeId }, { actorUserId: userId }
    );
    expect(result.id).toBeDefined();
    expect(result.status).toBe('AKTIF');
  }, 15000);

  it('suggestVolunteers harus kosong karena jemaatId sudah ditugaskan', async () => {
    const result = await eventService.suggestVolunteers(eventId, volunteerTypeId);
    expect(Array.isArray(result)).toBe(true);
    expect(result.map((r) => r.jemaat_id)).not.toContain(jemaatId);
  }, 15000);

  it('transitionStatus AKTIF → SELESAI harus menutup absensi_status', async () => {
    const result = await eventService.transitionStatus(eventId, 'SELESAI', { actorUserId: userId });
    expect(result.status).toBe('SELESAI');
    expect(result.absensi_status).toBe('CLOSED');
  }, 15000);

  it('updateEvent harus 400 jika event sudah SELESAI', async () => {
    await expect(eventService.updateEvent(eventId, { judul: 'Baru' }, { actorUserId: userId }))
      .rejects.toMatchObject({ statusCode: 400 });
  }, 15000);
});