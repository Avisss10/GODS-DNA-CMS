require('dotenv').config();
const { getPool, closePool } = require('../../../src/config/database');
const jemaatRepository = require('../../../src/modules/jemaat/jemaat.repository');
const volunteerService = require('../../../src/modules/volunteer/volunteer.service');
const { ensureTablesExist } = require('../../helpers/ensure-tables');

const hasFullConfig =
  !!process.env.DB_HOST && !!process.env.DB_USER && !!process.env.DB_NAME &&
  !!process.env.AES_ENCRYPTION_KEY && !!process.env.AUDIT_HMAC_SECRET;

const describeIfReady = hasFullConfig ? describe : describe.skip;

describeIfReady('volunteer.service — Integration Test (TiDB nyata)', () => {
  let jemaatId, inactiveJemaatId, volunteerTypeId;

  beforeAll(async () => {
    await ensureTablesExist();

    jemaatId = await jemaatRepository.create({
      nama: `Volunteer Service Test ${Date.now()}`, tgl_lahir: '1990-01-01',
      jenis_kelamin: 'L', tgl_bergabung: '2026-01-01',
    });

    inactiveJemaatId = await jemaatRepository.create({
      nama: `Jemaat Nonaktif Test ${Date.now()}`, tgl_lahir: '1990-01-01',
      jenis_kelamin: 'P', tgl_bergabung: '2026-01-01',
    });
    await jemaatRepository.update(inactiveJemaatId, { is_active: false });
  }, 30000);

  afterAll(async () => {
    const pool = getPool();
    if (volunteerTypeId) {
      await pool.query('DELETE FROM volunteer_members WHERE volunteer_type_id = :id', { id: volunteerTypeId });
      await pool.query('DELETE FROM volunteer_jenis WHERE id = :id', { id: volunteerTypeId });
    }
    await pool.query('DELETE FROM jemaat WHERE id IN (:a, :b)', { a: jemaatId, b: inactiveJemaatId });
    await pool.query('DELETE FROM audit_logs WHERE modul = :modul', { modul: 'VOLUNTEER' });
    await closePool();
  }, 30000);

  it('createVolunteerType harus berhasil membuat jenis volunteer baru', async () => {
    const result = await volunteerService.createVolunteerType({
      nama: `Multimedia Service Test ${Date.now()}`,
    });
    volunteerTypeId = result.id;
    expect(typeof volunteerTypeId).toBe('number');
  }, 15000);

  it('registerVolunteer harus berhasil untuk jemaat aktif', async () => {
    const result = await volunteerService.registerVolunteer(jemaatId, volunteerTypeId);
    expect(result.id).toBeDefined();
  }, 15000);

  it('registerVolunteer harus 400 untuk jemaat tidak aktif', async () => {
    await expect(
      volunteerService.registerVolunteer(inactiveJemaatId, volunteerTypeId)
    ).rejects.toMatchObject({ statusCode: 400 });
  }, 15000);

  it('registerVolunteer harus 409 jika diulang untuk jemaat+type yang sama', async () => {
    await expect(
      volunteerService.registerVolunteer(jemaatId, volunteerTypeId)
    ).rejects.toMatchObject({ statusCode: 409 });
  }, 15000);

  it('unregisterVolunteer harus berhasil menonaktifkan pendaftaran', async () => {
    await volunteerService.unregisterVolunteer(jemaatId, volunteerTypeId);

    const memberRepo = require('../../../src/modules/volunteer/volunteer-member.repository');
    const result = await memberRepo.findByJemaatAndType(jemaatId, volunteerTypeId);
    expect(result.is_active).toBe(0);
  }, 15000);

  it('deactivateVolunteerType harus berhasil menonaktifkan jenis volunteer', async () => {
    await volunteerService.deactivateVolunteerType(volunteerTypeId);

    const jenisRepo = require('../../../src/modules/volunteer/volunteer-jenis.repository');
    const result = await jenisRepo.findById(volunteerTypeId);
    expect(result.is_active).toBe(0);
  }, 15000);
});

if (!hasFullConfig) {
  describe('volunteer.service — Integration Test', () => {
    it.skip('di-skip: konfigurasi belum lengkap di .env', () => {});
  });
}