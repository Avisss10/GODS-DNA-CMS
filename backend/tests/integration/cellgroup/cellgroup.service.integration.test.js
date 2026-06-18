require('dotenv').config();
const sharp = require('sharp');
const { getPool, closePool } = require('../../../src/config/database');
const jemaatRepository = require('../../../src/modules/jemaat/jemaat.repository');
const cgRepository = require('../../../src/modules/cellgroup/cellgroup.repository');
const meetingRepository = require('../../../src/modules/cellgroup/cellgroup-meeting.repository');
const cgService = require('../../../src/modules/cellgroup/cellgroup.service');
const authRepository = require('../../../src/modules/auth/auth.repository');
const { hashPassword } = require('../../../src/utils/password.util');
const { ensureTablesExist } = require('../../helpers/ensure-tables');

const hasFullConfig =
  !!process.env.DB_HOST && !!process.env.DB_USER && !!process.env.DB_NAME &&
  !!process.env.AES_ENCRYPTION_KEY && !!process.env.AUDIT_HMAC_SECRET;

const describeIfReady = hasFullConfig ? describe : describe.skip;

describeIfReady('cellgroup.service — Integration Test (TiDB nyata)', () => {
  let leaderId, memberId, cgId, meetingId, photoId, actorUserId;

  beforeAll(async () => {
    await ensureTablesExist();

    leaderId = await jemaatRepository.create({
      nama: `Leader Service Test ${Date.now()}`, tgl_lahir: '1985-01-01',
      jenis_kelamin: 'L', tgl_bergabung: '2020-01-01',
    });
    memberId = await jemaatRepository.create({
      nama: `Member Service Test ${Date.now()}`, tgl_lahir: '1995-01-01',
      jenis_kelamin: 'P', tgl_bergabung: '2026-01-01',
    });

    // cg_meeting.created_by adalah NOT NULL (Step 6), jadi kita butuh
    // user aktor sungguhan, bukan null, untuk setiap pemanggilan
    // createMeeting di test ini.
    actorUserId = await authRepository.createUser({
      username: `test_cg_service_actor_${Date.now()}`,
      passwordHash: await hashPassword('Password123!'),
      peran: 'ADMIN',
    });
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
    await pool.query('DELETE FROM users WHERE id = :id', { id: actorUserId });
    await pool.query('DELETE FROM audit_logs WHERE modul = :modul', { modul: 'CELL_GROUP' });
    await pool.query('DELETE FROM audit_logs WHERE modul = :modul AND object_id = :id', { modul: 'AUTH', id: actorUserId });
    await closePool();
  }, 30000);

  it('createCellGroup harus berhasil membuat CG baru', async () => {
    const result = await cgService.createCellGroup({ nama: 'CG Service Integration', leaderId }, { actorUserId });
    cgId = result.id;
    expect(typeof cgId).toBe('number');
  }, 15000);

  it('addMemberToCg harus berhasil menambah member, gagal jika diulang (409)', async () => {
    await cgService.addMemberToCg(cgId, memberId, { actorUserId });

    const isActive = await cgRepository.isJemaatActiveMember(cgId, memberId);
    expect(isActive).toBe(true);

    await expect(cgService.addMemberToCg(cgId, memberId, { actorUserId })).rejects.toMatchObject({ statusCode: 409 });
  }, 15000);

  it('createMeeting harus berhasil karena CG punya leader aktif', async () => {
    const result = await cgService.createMeeting({
      cgId, judul: 'Meeting Service Test', jenis: 'OFFLINE',
      waktuMulai: '2026-06-20 19:00:00', waktuSelesai: '2026-06-20 21:00:00',
    }, { actorUserId });
    meetingId = result.id;
    expect(typeof meetingId).toBe('number');
  }, 15000);

  it('createMeeting harus gagal (400) jika leader CG tidak aktif', async () => {
    const inactiveLeaderId = await jemaatRepository.create({
      nama: `Leader Nonaktif ${Date.now()}`, tgl_lahir: '1980-01-01',
      jenis_kelamin: 'L', tgl_bergabung: '2020-01-01',
    });
    await jemaatRepository.update(inactiveLeaderId, { is_active: false });

    const cgResult = await cgService.createCellGroup({ nama: 'CG Leader Nonaktif', leaderId: inactiveLeaderId }, { actorUserId });

    await expect(
      cgService.createMeeting({
        cgId: cgResult.id, judul: 'Meeting Gagal', jenis: 'OFFLINE',
        waktuMulai: '2026-06-21 19:00:00', waktuSelesai: '2026-06-21 21:00:00',
      }, { actorUserId })
    ).rejects.toMatchObject({ statusCode: 400, message: 'Tunjuk leader baru terlebih dahulu' });

    const pool = getPool();
    await pool.query('DELETE FROM cell_group_members WHERE cg_id = :id', { id: cgResult.id });
    await pool.query('DELETE FROM cell_group WHERE id = :id', { id: cgResult.id });
    await pool.query('DELETE FROM jemaat WHERE id = :id', { id: inactiveLeaderId });
  }, 15000);

  it('addPhotoToMeeting harus mengompres foto menjadi <= 500KB dan menyimpannya', async () => {
    const largeImageBuffer = await sharp({
      create: { width: 1500, height: 1500, channels: 3, background: { r: 80, g: 120, b: 160 } },
    }).jpeg({ quality: 100 }).toBuffer();

    const result = await cgService.addPhotoToMeeting(meetingId, largeImageBuffer, { actorUserId });
    photoId = result.id;

    expect(result.sizeKb).toBeLessThanOrEqual(500);

    const count = await meetingRepository.countMeetingPhotos(meetingId);
    expect(count).toBe(1);
  }, 30000);

  it('submitAbsensi harus berhasil menyimpan absensi untuk leader dan member', async () => {
    await cgService.submitAbsensi(meetingId, [
      { jemaatId: leaderId, hadir: true },
      { jemaatId: memberId, hadir: false },
    ], { actorUserId });

    const absensi = await meetingRepository.findAbsensiByMeeting(meetingId);
    expect(absensi).toHaveLength(2);
  }, 15000);
});

if (!hasFullConfig) {
  describe('cellgroup.service — Integration Test', () => {
    it.skip('di-skip: konfigurasi belum lengkap di .env', () => {});
  });
}