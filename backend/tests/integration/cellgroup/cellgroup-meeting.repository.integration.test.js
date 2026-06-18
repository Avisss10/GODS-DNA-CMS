require('dotenv').config();
const { getPool, closePool } = require('../../../src/config/database');
const jemaatRepository = require('../../../src/modules/jemaat/jemaat.repository');
const cgRepository = require('../../../src/modules/cellgroup/cellgroup.repository');
const meetingRepository = require('../../../src/modules/cellgroup/cellgroup-meeting.repository');
const authRepository = require('../../../src/modules/auth/auth.repository');
const { hashPassword } = require('../../../src/utils/password.util');
const { ensureTablesExist } = require('../../helpers/ensure-tables');

const hasFullConfig =
  !!process.env.DB_HOST && !!process.env.DB_USER && !!process.env.DB_NAME &&
  !!process.env.AES_ENCRYPTION_KEY;

const describeIfReady = hasFullConfig ? describe : describe.skip;

/**
 * Waktu meeting di-set ke KEMARIN (relatif terhadap saat test
 * dijalankan), bukan tanggal absolut hardcoded — supaya skenario
 * "left_at terjadi SETELAH waktu meeting" selalu benar arahnya,
 * tidak peduli kapan test ini dijalankan. left_at di-set via
 * removeMember() yang memakai NOW() (hari ini), yang pasti
 * setelah "kemarin".
 */
function getYesterdayDateTimeString(hour) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:00:00`;
}

describeIfReady('cellgroup-meeting.repository — Integration Test (TiDB nyata)', () => {
  let leaderId, memberId, cgId, meetingId, userId;
  const waktuMulai = getYesterdayDateTimeString('19');
  const waktuSelesai = getYesterdayDateTimeString('21');

  beforeAll(async () => {
    await ensureTablesExist();

    leaderId = await jemaatRepository.create({
      nama: `Leader Meeting Test ${Date.now()}`, tgl_lahir: '1985-01-01',
      jenis_kelamin: 'L', tgl_bergabung: '2020-01-01',
    });
    memberId = await jemaatRepository.create({
      nama: `Member Meeting Test ${Date.now()}`, tgl_lahir: '1995-01-01',
      jenis_kelamin: 'P', tgl_bergabung: '2026-01-01',
    });
    cgId = await cgRepository.create({ nama: 'CG Meeting Test', leaderId });
    await cgRepository.addMember(cgId, memberId);

    userId = await authRepository.createUser({
      username: `test_meeting_creator_${Date.now()}`,
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
    await pool.query('DELETE FROM cell_group_members WHERE cg_id = :id', { id: cgId });
    await pool.query('DELETE FROM cell_group WHERE id = :id', { id: cgId });
    await pool.query('DELETE FROM jemaat WHERE id IN (:leaderId, :memberId)', { leaderId, memberId });
    await pool.query('DELETE FROM users WHERE id = :id', { id: userId });
    await closePool();
  }, 30000);

  it('createMeeting harus berhasil membuat meeting baru', async () => {
    meetingId = await meetingRepository.createMeeting({
      cgId, judul: 'Meeting Integration Test', jenis: 'OFFLINE',
      waktuMulai, waktuSelesai,
      createdBy: userId,
    });

    expect(typeof meetingId).toBe('number');
  }, 15000);

  it('findMeetingById harus mengembalikan data meeting yang benar', async () => {
    const meeting = await meetingRepository.findMeetingById(meetingId);
    expect(meeting.judul).toBe('Meeting Integration Test');
  }, 15000);

  it('countMeetingPhotos harus 0 sebelum ada foto ditambahkan', async () => {
    expect(await meetingRepository.countMeetingPhotos(meetingId)).toBe(0);
  }, 15000);

  it('addMeetingPhoto harus menambah foto, countMeetingPhotos harus jadi 1', async () => {
    await meetingRepository.addMeetingPhoto({
      meetingId, filePath: '/uploads/test.jpg', fileSizeKb: 450, uploadedBy: userId,
    });

    expect(await meetingRepository.countMeetingPhotos(meetingId)).toBe(1);
  }, 15000);

  it('findActiveMembersAtMeetingTime harus mengembalikan leader dan member (keduanya masih aktif)', async () => {
    const members = await meetingRepository.findActiveMembersAtMeetingTime(cgId, waktuMulai);

    expect(members.some((m) => m.id === leaderId)).toBe(true);
    expect(members.some((m) => m.id === memberId)).toBe(true);
  }, 15000);

  it('upsertAbsensi harus berhasil insert absensi baru', async () => {
    await meetingRepository.upsertAbsensi(meetingId, leaderId, true);
    await meetingRepository.upsertAbsensi(meetingId, memberId, false);

    const absensi = await meetingRepository.findAbsensiByMeeting(meetingId);
    expect(absensi).toHaveLength(2);
  }, 15000);

  it('upsertAbsensi harus UPDATE (bukan insert baru) jika dipanggil lagi untuk jemaat yang sama', async () => {
    await meetingRepository.upsertAbsensi(meetingId, memberId, true); // ubah dari false ke true

    const absensi = await meetingRepository.findAbsensiByMeeting(meetingId);
    expect(absensi).toHaveLength(2); // tetap 2 baris, bukan 3

    const memberAbsensi = absensi.find((a) => a.jemaat_id === memberId);
    expect(memberAbsensi.hadir).toBe(1);
  }, 15000);

  it('findActiveMembersAtMeetingTime harus tetap menampilkan member yang left_at-nya SETELAH waktu meeting', async () => {
    // Meeting terjadi KEMARIN; removeMember() set left_at = NOW() (HARI INI),
    // yaitu setelah waktu meeting — sehingga member seharusnya tetap
    // muncul saat query histori meeting kemarin (BAGIAN 3.4 langkah 1).
    await cgRepository.removeMember(cgId, memberId);

    const members = await meetingRepository.findActiveMembersAtMeetingTime(cgId, waktuMulai);

    expect(members.some((m) => m.id === memberId)).toBe(true);
  }, 15000);
});

if (!hasFullConfig) {
  describe('cellgroup-meeting.repository — Integration Test', () => {
    it.skip('di-skip: konfigurasi belum lengkap di .env', () => {});
  });
}