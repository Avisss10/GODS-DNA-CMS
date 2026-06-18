require('dotenv').config();
const { getPool, closePool } = require('../../../src/config/database');
const jemaatRepository = require('../../../src/modules/jemaat/jemaat.repository');
const cgRepository = require('../../../src/modules/cellgroup/cellgroup.repository');
const { ensureTablesExist } = require('../../helpers/ensure-tables');

const hasFullConfig =
  !!process.env.DB_HOST && !!process.env.DB_USER && !!process.env.DB_NAME &&
  !!process.env.AES_ENCRYPTION_KEY;

const describeIfReady = hasFullConfig ? describe : describe.skip;

describeIfReady('cellgroup.repository — Integration Test (TiDB nyata)', () => {
  let leaderId, memberId, cgId;

  beforeAll(async () => {
    await ensureTablesExist();

    leaderId = await jemaatRepository.create({
      nama: `Leader Test ${Date.now()}`,
      tgl_lahir: '1985-01-01',
      jenis_kelamin: 'L',
      tgl_bergabung: '2020-01-01',
    });

    memberId = await jemaatRepository.create({
      nama: `Member Test ${Date.now()}`,
      tgl_lahir: '1995-01-01',
      jenis_kelamin: 'P',
      tgl_bergabung: '2026-01-01',
    });
  }, 30000);

  afterAll(async () => {
    const pool = getPool();
    if (cgId) {
      await pool.query('DELETE FROM cell_group_members WHERE cg_id = :id', { id: cgId });
      await pool.query('DELETE FROM cell_group WHERE id = :id', { id: cgId });
    }
    await pool.query('DELETE FROM jemaat WHERE id IN (:leaderId, :memberId)', { leaderId, memberId });
    await closePool();
  }, 30000);

  it('create harus membuat CG dan otomatis mendaftarkan leader sebagai anggota', async () => {
    cgId = await cgRepository.create({ nama: 'CG Integration Test', leaderId });

    expect(typeof cgId).toBe('number');

    const members = await cgRepository.findActiveMembers(cgId);
    expect(members.some((m) => m.id === leaderId)).toBe(true);
  }, 15000);

  it('findById harus mengembalikan data CG yang baru dibuat', async () => {
    const cg = await cgRepository.findById(cgId);

    expect(cg.nama).toBe('CG Integration Test');
    expect(cg.leader_id).toBe(leaderId);
  }, 15000);

  it('findActiveLeader harus mengembalikan data leader karena masih aktif', async () => {
    const leader = await cgRepository.findActiveLeader(cgId);

    expect(leader.id).toBe(leaderId);
  }, 15000);

  it('isJemaatActiveMember harus false untuk jemaat yang belum jadi anggota', async () => {
    const result = await cgRepository.isJemaatActiveMember(cgId, memberId);
    expect(result).toBe(false);
  }, 15000);

  it('addMember harus berhasil menambah anggota baru', async () => {
    await cgRepository.addMember(cgId, memberId);

    const isActive = await cgRepository.isJemaatActiveMember(cgId, memberId);
    expect(isActive).toBe(true);
  }, 15000);

  it('findActiveMembers harus mengembalikan 2 anggota (leader + member baru)', async () => {
    const members = await cgRepository.findActiveMembers(cgId);
    expect(members).toHaveLength(2);
  }, 15000);

  it('removeMember harus membuat isJemaatActiveMember menjadi false', async () => {
    await cgRepository.removeMember(cgId, memberId);

    const isActive = await cgRepository.isJemaatActiveMember(cgId, memberId);
    expect(isActive).toBe(false);
  }, 15000);

  it('findActiveMembers harus kembali ke 1 anggota setelah removeMember', async () => {
    const members = await cgRepository.findActiveMembers(cgId);
    expect(members).toHaveLength(1);
  }, 15000);
});

if (!hasFullConfig) {
  describe('cellgroup.repository — Integration Test', () => {
    it.skip('di-skip: konfigurasi belum lengkap di .env', () => {});
  });
}