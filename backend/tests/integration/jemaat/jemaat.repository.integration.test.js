require('dotenv').config();
const { getPool, closePool } = require('../../../src/config/database');
const repo = require('../../../src/modules/jemaat/jemaat.repository');
const { ensureTablesExist } = require('../../helpers/ensure-tables');

const hasFullConfig =
  !!process.env.DB_HOST && !!process.env.DB_USER && !!process.env.DB_NAME &&
  !!process.env.AES_ENCRYPTION_KEY;

const describeIfReady = hasFullConfig ? describe : describe.skip;

describeIfReady('jemaat.repository — Integration Test (TiDB nyata)', () => {
  let createdId;

  beforeAll(async () => {
    await ensureTablesExist();
  }, 30000);

  afterAll(async () => {
    if (createdId) {
      const pool = getPool();
      await pool.query('DELETE FROM jemaat WHERE id = :id', { id: createdId });
    }
    await closePool();
  }, 30000);

  it('create harus menyimpan jemaat baru dengan field sensitif terenkripsi', async () => {
    createdId = await repo.create({
      nama: 'Test Jemaat Integration',
      tgl_lahir: '1995-05-15',
      jenis_kelamin: 'L',
      no_hp: '081298765432',
      alamat: 'Jl. Integration Test No. 99',
      media_sosial: { instagram: '@testjemaat' },
      tgl_bergabung: '2026-06-01',
    });

    expect(typeof createdId).toBe('number');
  }, 15000);

  it('findById harus mengembalikan data dengan no_hp dalam bentuk ciphertext (bukan plaintext)', async () => {
    const result = await repo.findById(createdId);

    expect(result.no_hp).not.toBe('081298765432');
    expect(result.no_hp_iv).toBeDefined();
  }, 15000);

  it('findByIdDecrypted harus mengembalikan plaintext yang benar', async () => {
    const result = await repo.findByIdDecrypted(createdId);

    expect(result.no_hp).toBe('081298765432');
    expect(result.alamat).toBe('Jl. Integration Test No. 99');
    expect(result.media_sosial).toEqual({ instagram: '@testjemaat' });
  }, 15000);

  it('jemaat baru harus is_new_member=true dan new_member_until terisi benar', async () => {
    const result = await repo.findById(createdId);

    expect(result.is_new_member).toBe(1);
    expect(result.new_member_until).not.toBeNull();
  }, 15000);

  it('update harus mengganti no_hp dengan ciphertext dan IV baru', async () => {
    const before = await repo.findById(createdId);

    await repo.update(createdId, { no_hp: '085511112222' });

    const after = await repo.findById(createdId);
    expect(after.no_hp).not.toBe(before.no_hp);
    expect(after.no_hp_iv).not.toBe(before.no_hp_iv);

    const decrypted = await repo.findByIdDecrypted(createdId);
    expect(decrypted.no_hp).toBe('085511112222');
  }, 15000);

  it('findDuplicateCandidatesByNameAndBirthdate harus menemukan nama mirip dengan tgl_lahir sama', async () => {
    const result = await repo.findDuplicateCandidatesByNameAndBirthdate(
      'Test Jemaat Integrationn', // typo 1 huruf
      '1995-05-15'
    );

    expect(result.some((r) => r.id === createdId)).toBe(true);
  }, 15000);

  it('findDuplicateCandidatesByPhone harus menemukan no_hp yang sama setelah update', async () => {
    const result = await repo.findDuplicateCandidatesByPhone('085511112222');

    expect(result.some((r) => r.id === createdId)).toBe(true);
  }, 15000);

  it('checkDependencies harus mengembalikan array kosong untuk jemaat tanpa dependensi', async () => {
    const result = await repo.checkDependencies(createdId);

    expect(result.isLeaderOfActiveCg).toEqual([]);
    expect(result.scheduledAsVolunteer).toEqual([]);
    expect(result.activeMemberOfCg).toEqual([]);
  }, 15000);

  it('softDelete harus membuat findById mengembalikan null', async () => {
    await repo.softDelete(createdId);

    const result = await repo.findById(createdId);
    expect(result).toBeNull();
  }, 15000);
});

if (!hasFullConfig) {
  describe('jemaat.repository — Integration Test', () => {
    it.skip('di-skip: konfigurasi DB/AES_ENCRYPTION_KEY belum lengkap di .env', () => {});
  });
}