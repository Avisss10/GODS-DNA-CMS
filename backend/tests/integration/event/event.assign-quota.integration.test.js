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

describeIfReady('event.service — assignVolunteer pessimistic lock kuota (Integration Test, TiDB nyata)', () => {
  let pool, userId, jemaatId1, jemaatId2, volunteerTypeId, eventId;

  beforeAll(async () => {
    await ensureTablesExist();
    pool = getPool();

    const hash = await hashPassword('Password123!');
    userId = await authRepository.createUser({
      username: `event_quota_test_${Date.now()}`,
      passwordHash: hash, peran: 'ADMIN',
    });

    jemaatId1 = await jemaatRepository.create({
      nama: `Quota Test A ${Date.now()}`,
      tgl_lahir: '1990-01-01', jenis_kelamin: 'L', tgl_bergabung: '2024-01-01',
    });
    jemaatId2 = await jemaatRepository.create({
      nama: `Quota Test B ${Date.now()}`,
      tgl_lahir: '1990-01-01', jenis_kelamin: 'P', tgl_bergabung: '2024-01-01',
    });

    const vt = await volunteerService.createVolunteerType(
      { nama: `QuotaVol ${Date.now()}` }, { actorUserId: userId }
    );
    volunteerTypeId = vt.id;
    await volunteerService.registerVolunteer(jemaatId1, volunteerTypeId, { actorUserId: userId });
    await volunteerService.registerVolunteer(jemaatId2, volunteerTypeId, { actorUserId: userId });

    const event = await eventService.createEvent({
      judul: `Event Quota Test ${Date.now()}`, jenis: 'IBADAH',
      waktu_mulai: '2026-12-01 09:00:00', waktu_selesai: '2026-12-01 11:00:00',
    }, { actorUserId: userId });
    eventId = event.id;
    await eventService.transitionStatus(eventId, 'PUBLISHED', { actorUserId: userId });

    // Kuota tersisa 1 untuk event + jenis ini
    await pool.query(
      `INSERT INTO event_volunteer_needs (event_id, volunteer_type_id, kuota) VALUES (:eventId, :volunteerTypeId, 1)`,
      { eventId, volunteerTypeId }
    );
  }, 30000);

  afterAll(async () => {
    if (eventId) {
      await pool.query('DELETE FROM event_volunteer_needs WHERE event_id = :id', { id: eventId });
      await pool.query('DELETE FROM event_attendances WHERE event_id = :id', { id: eventId });
      await pool.query('DELETE FROM event_volunteer WHERE event_id = :id', { id: eventId });
      await pool.query('DELETE FROM event WHERE id = :id', { id: eventId });
    }
    if (volunteerTypeId) {
      await pool.query('DELETE FROM volunteer_members WHERE volunteer_type_id = :id', { id: volunteerTypeId });
      await pool.query('DELETE FROM volunteer_jenis WHERE id = :id', { id: volunteerTypeId });
    }
    if (jemaatId1) await pool.query('DELETE FROM jemaat WHERE id = :id', { id: jemaatId1 });
    if (jemaatId2) await pool.query('DELETE FROM jemaat WHERE id = :id', { id: jemaatId2 });
    if (userId) await pool.query('DELETE FROM users WHERE id = :id', { id: userId });
    await pool.query("DELETE FROM audit_logs WHERE modul IN ('EVENT','VOLUNTEER','AUTH')");
    await closePool();
  }, 30000);

  it('harus mencegah double-assign saat dua request bersamaan menugaskan ke kuota tersisa 1 (pessimistic lock)', async () => {
    const [resultA, resultB] = await Promise.allSettled([
      eventService.assignVolunteer(eventId, { jemaat_id: jemaatId1, jenis_id: volunteerTypeId }, { actorUserId: userId }),
      eventService.assignVolunteer(eventId, { jemaat_id: jemaatId2, jenis_id: volunteerTypeId }, { actorUserId: userId }),
    ]);

    const outcomes = [resultA, resultB];
    const fulfilled = outcomes.filter((r) => r.status === 'fulfilled');
    const rejected = outcomes.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ statusCode: 409 });

    const [rows] = await pool.query(
      `SELECT COUNT(*) AS total FROM event_volunteer
       WHERE event_id = :eventId AND jenis_id = :volunteerTypeId AND status = 'AKTIF'`,
      { eventId, volunteerTypeId }
    );
    expect(Number(rows[0].total)).toBe(1);
  }, 30000);
});
