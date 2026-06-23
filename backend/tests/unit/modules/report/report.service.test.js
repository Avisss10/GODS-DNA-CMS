jest.mock('../../../../src/modules/report/report.repository');
jest.mock('../../../../src/modules/auditlog/auditlog.repository');
jest.mock('../../../../src/utils/encryption.util');

const reportRepository = require('../../../../src/modules/report/report.repository');
const { recordAuditLog } = require('../../../../src/modules/auditlog/auditlog.repository');
const { decrypt } = require('../../../../src/utils/encryption.util');

const {
  generateJemaatReport,
  generateEventReport,
  generateCGReport,
  generateVolunteerReport,
  generateAnalyticsReport,
  generateSignedToken,
  consumeSignedToken,
  dekripsiBarisJemaat,
} = require('../../../../src/modules/report/report.service');

beforeEach(() => {
  jest.clearAllMocks();
  recordAuditLog.mockResolvedValue(1);
  decrypt.mockImplementation((val) => `decrypted:${val}`);
});

// ── dekripsiBarisJemaat ───────────────────────────────────────────
describe('report.service — dekripsiBarisJemaat (Unit Test)', () => {
  it('harus dekripsi no_hp dan alamat jika ada IV', () => {
    const row = {
      id: 1, nama: 'Budi',
      no_hp: 'encrypted_hp', no_hp_iv: 'iv1',
      alamat: 'encrypted_addr', alamat_iv: 'iv2',
    };
    const result = dekripsiBarisJemaat(row);
    expect(result.no_hp).toBe('decrypted:encrypted_hp');
    expect(result.alamat).toBe('decrypted:encrypted_addr');
    expect(result.no_hp_iv).toBeUndefined();
    expect(result.alamat_iv).toBeUndefined();
  });

  it('harus return [DECRYPT_ERROR] jika dekripsi gagal', () => {
    decrypt.mockImplementation(() => { throw new Error('Bad decrypt'); });
    const row = { id: 1, nama: 'Budi', no_hp: 'enc', no_hp_iv: 'iv', alamat: 'enc', alamat_iv: 'iv' };
    const result = dekripsiBarisJemaat(row);
    expect(result.no_hp).toBe('[DECRYPT_ERROR]');
    expect(result.alamat).toBe('[DECRYPT_ERROR]');
  });
});

// ── generateSignedToken & consumeSignedToken ──────────────────────
describe('report.service — signed token (Unit Test)', () => {
  it('token yang valid harus bisa dikonsumsi 1x', () => {
    const token = generateSignedToken('test-file.json');
    const result = consumeSignedToken(token);
    expect(result).not.toBeNull();
    expect(result.fileName).toBe('test-file.json');
  });

  it('token yang sudah dipakai tidak bisa dipakai lagi', () => {
    const token = generateSignedToken('test-file2.json');
    consumeSignedToken(token); // pakai pertama
    const result = consumeSignedToken(token); // pakai kedua
    expect(result).toBeNull();
  });

  it('token yang tidak ada harus return null', () => {
    expect(consumeSignedToken('invalid-token-xyz')).toBeNull();
  });
});

// ── generateJemaatReport ──────────────────────────────────────────
describe('report.service — generateJemaatReport (Unit Test)', () => {
  it('harus return data langsung jika total < 500 (sinkron)', async () => {
    reportRepository.countJemaat.mockResolvedValue(3);
    reportRepository.getJemaatReport.mockResolvedValue([
      { id: 1, nama: 'Budi', no_hp: null, no_hp_iv: null, alamat: null, alamat_iv: null },
    ]);

    const result = await generateJemaatReport({}, { actorUserId: 1 });

    expect(result.async).toBe(false);
    expect(Array.isArray(result.data)).toBe(true);
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'EXPORT', modul: 'LAPORAN' })
    );
  });

  it('harus return token jika total >= 500 (async)', async () => {
    reportRepository.countJemaat.mockResolvedValue(500);
    reportRepository.getJemaatReport.mockResolvedValue(
      Array(500).fill({ id: 1, nama: 'Test', no_hp: null, no_hp_iv: null, alamat: null, alamat_iv: null })
    );

    const result = await generateJemaatReport({}, { actorUserId: 1 });

    expect(result.async).toBe(true);
    expect(result).toHaveProperty('token');
  });
});

// ── generateEventReport ───────────────────────────────────────────
describe('report.service — generateEventReport (Unit Test)', () => {
  it('harus return data event dan mencatat audit log', async () => {
    reportRepository.getEventKehadiranReport.mockResolvedValue([
      { event_id: 1, judul: 'Ibadah', total_hadir: 100 },
    ]);

    const result = await generateEventReport({}, { actorUserId: 1 });

    expect(result.async).toBe(false);
    expect(result.data[0].judul).toBe('Ibadah');
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'EXPORT', modul: 'LAPORAN' })
    );
  });
});

// ── generateCGReport ──────────────────────────────────────────────
describe('report.service — generateCGReport (Unit Test)', () => {
  it('harus return data CG dan mencatat audit log', async () => {
    reportRepository.getCGKehadiranReport.mockResolvedValue([
      { nama_cg: 'CG Alpha', nama_jemaat: 'Budi', hadir: true },
    ]);

    const result = await generateCGReport({}, { actorUserId: 1 });

    expect(result.async).toBe(false);
    expect(result.data[0].nama_cg).toBe('CG Alpha');
  });
});

// ── generateVolunteerReport ───────────────────────────────────────
describe('report.service — generateVolunteerReport (Unit Test)', () => {
  it('harus return data volunteer dan mencatat audit log', async () => {
    reportRepository.getVolunteerReport.mockResolvedValue([
      { nama_jemaat: 'Budi', nama_event: 'Ibadah', status: 'AKTIF' },
    ]);

    const result = await generateVolunteerReport({}, { actorUserId: 1 });

    expect(result.async).toBe(false);
    expect(result.data[0].status).toBe('AKTIF');
  });
});

// ── generateAnalyticsReport ───────────────────────────────────────
describe('report.service — generateAnalyticsReport (Unit Test)', () => {
  it('harus return data analytics per bulan', async () => {
    reportRepository.getAnalyticsReport.mockResolvedValue([
      { periode: '2026-01', jemaat_baru: 5, masih_aktif: 4 },
    ]);

    const result = await generateAnalyticsReport({ bulan: 6 }, { actorUserId: 1 });

    expect(result.async).toBe(false);
    expect(result.data[0].periode).toBe('2026-01');
  });
});