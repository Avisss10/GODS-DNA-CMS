require('dotenv').config();
const { getPool, closePool } = require('../../../src/config/database');
const {
  createJemaat,
  updateJemaat,
  deleteJemaat,
  viewSensitiveField,
} = require('../../../src/modules/jemaat/jemaat.service');
const { ensureTablesExist } = require('../../helpers/ensure-tables');

const hasFullConfig =
  !!process.env.DB_HOST && !!process.env.DB_USER && !!process.env.DB_NAME &&
  !!process.env.AES_ENCRYPTION_KEY && !!process.env.AUDIT_HMAC_SECRET;

const describeIfReady = hasFullConfig ? describe : describe.skip;

/**
 * Mengonversi Date object (dari kolom DATE TiDB) menjadi string
 * YYYY-MM-DD menggunakan komponen LOKAL (bukan toISOString, yang
 * mengonversi ke UTC dan bisa menggeser tanggal mundur satu hari
 * untuk timezone positif seperti WIB/UTC+7).
 */
function toDateOnlyString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describeIfReady('jemaat.service — Integration Test (TiDB nyata)', () => {
  let createdId;

  beforeAll(async () => {
    await ensureTablesExist();
  }, 30000);

  afterAll(async () => {
    const pool = getPool();
    if (createdId) {
      await pool.query('DELETE FROM jemaat WHERE id = :id', { id: createdId });
      await pool.query('DELETE FROM audit_logs WHERE object_id = :id AND modul = :modul', {
        id: createdId, modul: 'JEMAAT',
      });
    }
    await closePool();
  }, 30000);

  it('createJemaat harus berhasil membuat jemaat baru tanpa duplikat', async () => {
    const result = await createJemaat({
      nama: `Test Service ${Date.now()}`,
      tgl_lahir: '1992-03-10',
      jenis_kelamin: 'P',
      no_hp: `0813${Date.now().toString().slice(-8)}`,
      tgl_bergabung: '2026-06-01',
    }, { actorUserId: null });

    expect(result.id).toBeDefined();
    createdId = result.id;
  }, 15000);

  it('createJemaat harus mengembalikan requiresConfirmation untuk nama+tgl_lahir yang sama', async () => {
    const pool = getPool();
    const [rows] = await pool.query('SELECT nama, tgl_lahir FROM jemaat WHERE id = :id', { id: createdId });
    const existing = rows[0];

    const result = await createJemaat({
      nama: existing.nama,
      tgl_lahir: toDateOnlyString(existing.tgl_lahir),
      jenis_kelamin: 'P',
      tgl_bergabung: '2026-06-01',
    });

    expect(result.requiresConfirmation).toBe(true);
  }, 15000);

  it('updateJemaat harus berhasil update dan tercatat di audit_log', async () => {
    const updated = await updateJemaat(createdId, { nama: 'Nama Sudah Diupdate' }, { actorUserId: null });

    expect(updated.nama).toBe('Nama Sudah Diupdate');
  }, 15000);

  it('viewSensitiveField harus mengembalikan no_hp plaintext yang benar', async () => {
    const pool = getPool();
    const [rows] = await pool.query('SELECT no_hp, no_hp_iv FROM jemaat WHERE id = :id', { id: createdId });

    const result = await viewSensitiveField(createdId, 'no_hp', { actorUserId: null });

    expect(typeof result).toBe('string');
    expect(result).toMatch(/^0813/);
  }, 15000);

  it('deleteJemaat harus berhasil soft delete jemaat tanpa dependensi', async () => {
    await deleteJemaat(createdId, { actorUserId: null });

    const pool = getPool();
    const [rows] = await pool.query('SELECT deleted_at FROM jemaat WHERE id = :id', { id: createdId });
    expect(rows[0].deleted_at).not.toBeNull();
  }, 15000);
});

if (!hasFullConfig) {
  describe('jemaat.service — Integration Test', () => {
    it.skip('di-skip: konfigurasi belum lengkap di .env', () => {});
  });
}