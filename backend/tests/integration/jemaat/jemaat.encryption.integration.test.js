require('dotenv').config();
const { getPool, closePool } = require('../../../src/config/database');
const repo = require('../../../src/modules/jemaat/jemaat.repository');
const {
  backfillEncryptJemaatIdentity,
} = require('../../../src/scripts/backfill-encrypt-jemaat-identity');
const { decrypt } = require('../../../src/utils/encryption.util');
const { ensureTablesExist } = require('../../helpers/ensure-tables');

const hasFullConfig =
  !!process.env.DB_HOST && !!process.env.DB_USER && !!process.env.DB_NAME &&
  !!process.env.AES_ENCRYPTION_KEY;

const describeIfReady = hasFullConfig ? describe : describe.skip;

const HEX_PATTERN = /^[0-9a-f]+$/;

describeIfReady('jemaat — Enkripsi identitas (nama, tgl_lahir, jenis_kelamin) — Integration Test (TiDB nyata)', () => {
  const uniqueSuffix = Date.now();
  const namaAsli = `Enkripsi Identitas ${uniqueSuffix}`;
  const tglLahirAsli = '1994-08-17';
  const jenisKelaminAsli = 'P';
  const createdIds = [];

  beforeAll(async () => {
    await ensureTablesExist();
  }, 30000);

  afterAll(async () => {
    const pool = getPool();
    for (const id of createdIds) {
      await pool.query('DELETE FROM jemaat WHERE id = :id', { id });
    }
    await closePool();
  }, 30000);

  it('create harus menyimpan nama, tgl_lahir, jenis_kelamin sebagai ciphertext di database (raw query)', async () => {
    const id = await repo.create({
      nama: namaAsli,
      tgl_lahir: tglLahirAsli,
      jenis_kelamin: jenisKelaminAsli,
      tgl_bergabung: '2026-06-01',
    });
    createdIds.push(id);

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT nama, nama_iv, tgl_lahir, tgl_lahir_iv, jenis_kelamin, jenis_kelamin_iv
       FROM jemaat WHERE id = :id`,
      { id }
    );
    const raw = rows[0];

    // Nilai tersimpan BUKAN plaintext, melainkan hex ciphertext
    expect(raw.nama).not.toBe(namaAsli);
    expect(raw.tgl_lahir).not.toBe(tglLahirAsli);
    expect(raw.jenis_kelamin).not.toBe(jenisKelaminAsli);
    expect(raw.nama).toMatch(HEX_PATTERN);
    expect(raw.tgl_lahir).toMatch(HEX_PATTERN);
    expect(raw.jenis_kelamin).toMatch(HEX_PATTERN);

    // IV per field, masing-masing 32 hex char dan saling berbeda
    expect(raw.nama_iv).toHaveLength(32);
    expect(raw.tgl_lahir_iv).toHaveLength(32);
    expect(raw.jenis_kelamin_iv).toHaveLength(32);
    expect(raw.nama_iv).not.toBe(raw.tgl_lahir_iv);

    // Round-trip: dekripsi manual balik ke nilai asli
    expect(decrypt(raw.nama, raw.nama_iv)).toBe(namaAsli);
    expect(decrypt(raw.tgl_lahir, raw.tgl_lahir_iv)).toBe(tglLahirAsli);
    expect(decrypt(raw.jenis_kelamin, raw.jenis_kelamin_iv)).toBe(jenisKelaminAsli);
  }, 15000);

  it('findById harus mengembalikan identitas plaintext otomatis (format asli: nama, YYYY-MM-DD, L/P)', async () => {
    const result = await repo.findById(createdIds[0]);

    expect(result.nama).toBe(namaAsli);
    expect(result.tgl_lahir).toBe(tglLahirAsli);
    expect(result.jenis_kelamin).toBe(jenisKelaminAsli);
  }, 15000);

  it('findAll dengan search harus menemukan jemaat via substring nama meski tersimpan terenkripsi', async () => {
    const result = await repo.findAll({ search: `identitas ${uniqueSuffix}` });

    expect(result.some((r) => r.id === createdIds[0])).toBe(true);
    const found = result.find((r) => r.id === createdIds[0]);
    expect(found.nama).toBe(namaAsli);
    expect(found.jenis_kelamin).toBe(jenisKelaminAsli);
  }, 15000);

  it('deteksi duplikat harus menemukan nama mirip (typo) + tgl_lahir sama setelah dekripsi', async () => {
    const namaTypo = `${namaAsli.slice(0, -1)}x`; // ubah 1 karakter terakhir
    const result = await repo.findDuplicateCandidatesByNameAndBirthdate(namaTypo, tglLahirAsli);

    expect(result.some((r) => r.id === createdIds[0])).toBe(true);
  }, 15000);

  describe('migration backfill (data lama plaintext)', () => {
    const namaLama = `Legacy Plaintext ${uniqueSuffix}`;
    let legacyId;

    it('backfill harus mengenkripsi baris lama plaintext dan mengisi kolom _iv', async () => {
      const pool = getPool();

      // Simulasikan baris pra-migration: plaintext, _iv NULL
      const [insertResult] = await pool.query(
        `INSERT INTO jemaat (nama, tgl_lahir, jenis_kelamin, tgl_bergabung,
                             is_active, is_new_member, is_non_cg, skor_keaktifan, status_keaktifan)
         VALUES (:nama, '1985-12-01', 'L', '2025-05-10', TRUE, FALSE, TRUE, 0, 'BELUM_CUKUP_DATA')`,
        { nama: namaLama }
      );
      legacyId = insertResult.insertId;
      createdIds.push(legacyId);

      const { updated } = await backfillEncryptJemaatIdentity(pool);
      expect(updated).toBeGreaterThanOrEqual(1);

      const [rows] = await pool.query(
        `SELECT nama, nama_iv, tgl_lahir, tgl_lahir_iv, jenis_kelamin, jenis_kelamin_iv
         FROM jemaat WHERE id = :id`,
        { id: legacyId }
      );
      const raw = rows[0];

      expect(raw.nama_iv).toHaveLength(32);
      expect(raw.tgl_lahir_iv).toHaveLength(32);
      expect(raw.jenis_kelamin_iv).toHaveLength(32);
      expect(raw.nama).not.toBe(namaLama);

      // Hasil dekripsi balik ke nilai asli
      expect(decrypt(raw.nama, raw.nama_iv)).toBe(namaLama);
      expect(decrypt(raw.tgl_lahir, raw.tgl_lahir_iv)).toBe('1985-12-01');
      expect(decrypt(raw.jenis_kelamin, raw.jenis_kelamin_iv)).toBe('L');
    }, 20000);

    it('backfill harus idempotent — dijalankan ulang tidak boleh dobel-enkripsi', async () => {
      const pool = getPool();

      const [before] = await pool.query(
        'SELECT nama, nama_iv FROM jemaat WHERE id = :id',
        { id: legacyId }
      );

      await backfillEncryptJemaatIdentity(pool);

      const [after] = await pool.query(
        'SELECT nama, nama_iv FROM jemaat WHERE id = :id',
        { id: legacyId }
      );

      // Ciphertext & IV tidak berubah — baris yang sudah terenkripsi dilewati
      expect(after[0].nama).toBe(before[0].nama);
      expect(after[0].nama_iv).toBe(before[0].nama_iv);
      expect(decrypt(after[0].nama, after[0].nama_iv)).toBe(namaLama);
    }, 20000);
  });
});

if (!hasFullConfig) {
  describe('jemaat — Enkripsi identitas — Integration Test', () => {
    it.skip('di-skip: konfigurasi DB/AES_ENCRYPTION_KEY belum lengkap di .env', () => {});
  });
}
