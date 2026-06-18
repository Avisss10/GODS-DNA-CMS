require('dotenv').config();
const { getPool, closePool } = require('../../../src/config/database');
const jemaatRepository = require('../../../src/modules/jemaat/jemaat.repository');
const volunteerJenisRepository = require('../../../src/modules/volunteer/volunteer-jenis.repository');
const volunteerMemberRepository = require('../../../src/modules/volunteer/volunteer-member.repository');
const { ensureTablesExist } = require('../../helpers/ensure-tables');

const hasFullConfig =
  !!process.env.DB_HOST && !!process.env.DB_USER && !!process.env.DB_NAME &&
  !!process.env.AES_ENCRYPTION_KEY;

const describeIfReady = hasFullConfig ? describe : describe.skip;

describeIfReady('volunteer.repository — Integration Test (TiDB nyata)', () => {
  let jemaatId, volunteerTypeId;

  beforeAll(async () => {
    await ensureTablesExist();

    jemaatId = await jemaatRepository.create({
      nama: `Volunteer Test ${Date.now()}`, tgl_lahir: '1990-01-01',
      jenis_kelamin: 'L', tgl_bergabung: '2026-01-01',
    });
  }, 30000);

  afterAll(async () => {
    const pool = getPool();
    if (volunteerTypeId) {
      await pool.query('DELETE FROM volunteer_members WHERE volunteer_type_id = :id', { id: volunteerTypeId });
      await pool.query('DELETE FROM volunteer_jenis WHERE id = :id', { id: volunteerTypeId });
    }
    await pool.query('DELETE FROM jemaat WHERE id = :id', { id: jemaatId });
    await closePool();
  }, 30000);

  it('volunteer-jenis create harus berhasil membuat jenis volunteer baru', async () => {
    volunteerTypeId = await volunteerJenisRepository.create({
      nama: `Multimedia Test ${Date.now()}`, deskripsi: 'Tim multimedia gereja',
    });

    expect(typeof volunteerTypeId).toBe('number');
  }, 15000);

  it('findById harus mengembalikan data yang benar', async () => {
    const result = await volunteerJenisRepository.findById(volunteerTypeId);
    expect(result.deskripsi).toBe('Tim multimedia gereja');
  }, 15000);

  it('register harus berhasil mendaftarkan jemaat ke jenis volunteer', async () => {
    await volunteerMemberRepository.register(jemaatId, volunteerTypeId);

    const result = await volunteerMemberRepository.findByJemaatAndType(jemaatId, volunteerTypeId);
    expect(result.is_active).toBe(1);
  }, 15000);

  it('register dengan jemaat+type yang sama harus gagal karena UNIQUE constraint', async () => {
    await expect(
      volunteerMemberRepository.register(jemaatId, volunteerTypeId)
    ).rejects.toThrow();
  }, 15000);

  it('findActiveByJemaat harus menampilkan jenis volunteer yang baru didaftarkan', async () => {
    const result = await volunteerMemberRepository.findActiveByJemaat(jemaatId);
    expect(result.some((r) => r.volunteer_type_id === volunteerTypeId)).toBe(true);
  }, 15000);

  it('findActiveByType harus menampilkan jemaat yang baru didaftarkan', async () => {
    const result = await volunteerMemberRepository.findActiveByType(volunteerTypeId);
    expect(result.some((r) => r.jemaat_id === jemaatId)).toBe(true);
  }, 15000);

  it('deactivate harus membuat jemaat tidak lagi muncul di findActiveByType', async () => {
    await volunteerMemberRepository.deactivate(jemaatId, volunteerTypeId);

    const result = await volunteerMemberRepository.findActiveByType(volunteerTypeId);
    expect(result.some((r) => r.jemaat_id === jemaatId)).toBe(false);
  }, 15000);

  it('setActive(false) pada volunteer_jenis harus membuatnya hilang dari findAllActive', async () => {
    await volunteerJenisRepository.setActive(volunteerTypeId, false);

    const result = await volunteerJenisRepository.findAllActive();
    expect(result.some((r) => r.id === volunteerTypeId)).toBe(false);
  }, 15000);
});

if (!hasFullConfig) {
  describe('volunteer.repository — Integration Test', () => {
    it.skip('di-skip: konfigurasi belum lengkap di .env', () => {});
  });
}