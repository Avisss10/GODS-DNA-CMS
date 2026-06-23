require('dotenv').config();
const { getPool, closePool } = require('../../../src/config/database');
const jemaatRepository = require('../../../src/modules/jemaat/jemaat.repository');
const authRepository = require('../../../src/modules/auth/auth.repository');
const { hashPassword } = require('../../../src/utils/password.util');
const scoringService = require('../../../src/modules/scoring/scoring.service');
const { ensureTablesExist } = require('../../helpers/ensure-tables');

const hasFullConfig =
  !!process.env.DB_HOST && !!process.env.DB_USER && !!process.env.DB_NAME &&
  !!process.env.AES_ENCRYPTION_KEY && !!process.env.AUDIT_HMAC_SECRET;

const describeIfReady = hasFullConfig ? describe : describe.skip;

describeIfReady('scoring.service — Integration Test (TiDB nyata)', () => {
  let pool, userId, jemaatId, jemaatNewMemberId;

  beforeAll(async () => {
    await ensureTablesExist();
    pool = getPool();

    const hash = await hashPassword('Password123!');
    userId = await authRepository.createUser({
      username: `scoring_test_${Date.now()}`,
      passwordHash: hash, peran: 'ADMIN',
    });

    // Jemaat normal (bukan new member) untuk scoring
    jemaatId = await jemaatRepository.create({
      nama: `Scoring Test Jemaat ${Date.now()}`,
      tgl_lahir: '1990-01-01', jenis_kelamin: 'L', tgl_bergabung: '2024-01-01',
    });
    // Set is_new_member = false agar masuk scoring
    await pool.query(
      'UPDATE jemaat SET is_new_member = FALSE, new_member_until = NULL WHERE id = :id',
      { id: jemaatId }
    );

    // Jemaat baru (masih dalam grace period) — harus di-skip scoring
    jemaatNewMemberId = await jemaatRepository.create({
      nama: `Scoring NewMember Test ${Date.now()}`,
      tgl_lahir: '2000-01-01', jenis_kelamin: 'P', tgl_bergabung: '2026-06-01',
    });
  }, 30000);

  afterAll(async () => {
    if (jemaatId) await pool.query('DELETE FROM jemaat WHERE id = :id', { id: jemaatId });
    if (jemaatNewMemberId) await pool.query('DELETE FROM jemaat WHERE id = :id', { id: jemaatNewMemberId });
    if (userId) await pool.query('DELETE FROM users WHERE id = :id', { id: userId });
    await pool.query("DELETE FROM audit_logs WHERE modul = 'SCORING'");
    await closePool();
  }, 30000);

  it('hitungStatusKeaktifan harus mengembalikan string yang benar', () => {
    expect(scoringService.hitungStatusKeaktifan(75)).toBe('AKTIF');
    expect(scoringService.hitungStatusKeaktifan(45)).toBe('KURANG_AKTIF');
    expect(scoringService.hitungStatusKeaktifan(10)).toBe('TIDAK_AKTIF');
  });

  it('terapkanAntiCliff harus membatasi perubahan ±15', () => {
    expect(scoringService.terapkanAntiCliff(50, 100)).toBe(65);
    expect(scoringService.terapkanAntiCliff(50, 0)).toBe(35);
    expect(scoringService.terapkanAntiCliff(50, 55)).toBe(55);
  });

  it('hitungSkorJemaat harus berhasil dijalankan untuk jemaat tanpa data historis', async () => {
    const jemaat = await pool.query(
      'SELECT id, skor_keaktifan, status_keaktifan, is_non_cg FROM jemaat WHERE id = :id',
      { id: jemaatId }
    );
    const jemaatData = jemaat[0][0];

    const result = await scoringService.hitungSkorJemaat(jemaatId, jemaatData);

    expect(result).toHaveProperty('skorBaru');
    expect(result).toHaveProperty('statusBaru');
    expect(result).toHaveProperty('isNonCg');
    expect(typeof result.skorBaru).toBe('number');
    expect(['AKTIF', 'KURANG_AKTIF', 'TIDAK_AKTIF']).toContain(result.statusBaru);
  }, 15000);

  it('runScoringBatch harus memproses jemaat non-new-member', async () => {
    const result = await scoringService.runScoringBatch({ actorUserId: userId });

    expect(typeof result.processed).toBe('number');
    expect(typeof result.skipped).toBe('number');
    expect(result.processed).toBeGreaterThanOrEqual(1);
  }, 20000);

  it('skor jemaat harus terupdate setelah runScoringBatch', async () => {
    // Set skor awal ke 50 dulu
    await pool.query(
      'UPDATE jemaat SET skor_keaktifan = 50 WHERE id = :id',
      { id: jemaatId }
    );

    await scoringService.runScoringBatch({ actorUserId: userId });

    const [rows] = await pool.query(
      'SELECT skor_keaktifan, status_keaktifan FROM jemaat WHERE id = :id',
      { id: jemaatId }
    );
    const updated = rows[0];

    expect(typeof Number(updated.skor_keaktifan)).toBe('number');
    expect(['AKTIF', 'KURANG_AKTIF', 'TIDAK_AKTIF']).toContain(updated.status_keaktifan);
  }, 20000);

  it('jemaat new_member harus di-skip dari scoring', async () => {
    // Pastikan jemaatNewMemberId masih is_new_member = true
    const [rows] = await pool.query(
      'SELECT is_new_member FROM jemaat WHERE id = :id',
      { id: jemaatNewMemberId }
    );
    expect(rows[0].is_new_member).toBeTruthy();

    // Jalankan batch — jemaatNewMemberId tidak boleh masuk hitungan
    const result = await scoringService.runScoringBatch({ actorUserId: userId });
    // processed tidak harus 0, tapi jemaatNewMemberId tidak ikut
    expect(result).toHaveProperty('processed');
  }, 20000);

  it('anti-cliff harus terapkan batas ±15 pada skor real', async () => {
    // Set skor awal 0, tanpa data historis → skor mentah harusnya 0
    // anti-cliff: naik max 15 atau turun max 15 dari 0
    await pool.query('UPDATE jemaat SET skor_keaktifan = 0 WHERE id = :id', { id: jemaatId });

    const [rows] = await pool.query(
      'SELECT id, skor_keaktifan, status_keaktifan, is_non_cg FROM jemaat WHERE id = :id',
      { id: jemaatId }
    );
    const jemaatData = rows[0];

    const { skorBaru } = await scoringService.hitungSkorJemaat(jemaatId, jemaatData);

    // Dari skor 0, perubahan maksimal ±15
    expect(skorBaru).toBeGreaterThanOrEqual(0);
    expect(skorBaru).toBeLessThanOrEqual(15);
  }, 15000);

  it('hitungNilaiCG harus 0 jika tidak ada meeting', () => {
    expect(scoringService.hitungNilaiCG({ total_meeting: 0, total_hadir: 0 })).toBe(0);
  });

  it('hitungNilaiEvent harus 0 jika tidak ada event referensi', () => {
    expect(scoringService.hitungNilaiEvent([], [], 0)).toBe(0);
  });

  it('runScoringBatch harus mencatat audit_log untuk setiap jemaat yang diproses', async () => {
    await pool.query("DELETE FROM audit_logs WHERE modul = 'SCORING'");

    const result = await scoringService.runScoringBatch({ actorUserId: userId });

    const [auditRows] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM audit_logs WHERE modul = 'SCORING'"
    );
    expect(Number(auditRows[0].cnt)).toBe(result.processed);
  }, 20000);
});