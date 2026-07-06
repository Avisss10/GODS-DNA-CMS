jest.mock('../../../../src/modules/report/report.repository');
jest.mock('../../../../src/modules/auditlog/auditlog.repository');
jest.mock('../../../../src/utils/encryption.util');
jest.mock('../../../../src/config/redis');
jest.mock('../../../../src/modules/notification/notification.stub');

const fs = require('fs');
const { PassThrough } = require('stream');
const ExcelJS = require('exceljs');
const reportRepository = require('../../../../src/modules/report/report.repository');
const { recordAuditLog } = require('../../../../src/modules/auditlog/auditlog.repository');
const { decrypt, decryptJson } = require('../../../../src/utils/encryption.util');
const { getRedisClient } = require('../../../../src/config/redis');
const { notifyLeaders } = require('../../../../src/modules/notification/notification.stub');

let mockRedis;

const {
  isOutsideOperationalHours,
  generateJemaatReport,
  generateEventReport,
  generateCGReport,
  generateVolunteerReport,
  generateAnalyticsReport,
  generateSignedToken,
  consumeSignedToken,
  dekripsiBarisJemaat,
  writeRowsToXlsx,
  writeRowsToPdf,
  ReportError,
} = require('../../../../src/modules/report/report.service');

function collectStream(stream) {
  const chunks = [];
  stream.on('data', (c) => chunks.push(c));
  return () => Buffer.concat(chunks);
}

beforeEach(() => {
  jest.clearAllMocks();
  recordAuditLog.mockResolvedValue(1);
  notifyLeaders.mockResolvedValue(undefined);
  decrypt.mockImplementation((val) => `decrypted:${val}`);
  decryptJson.mockImplementation((val) => ({ instagram: `decrypted:${val}` }));

  // Signed-URL store sekarang di Redis (audit item 3). Mock in-memory
  // sederhana agar one-time-use (GETDEL) tetap teruji.
  const store = new Map();
  mockRedis = {
    set: jest.fn((key, value) => { store.set(key, value); return Promise.resolve('OK'); }),
    getdel: jest.fn((key) => {
      const v = store.has(key) ? store.get(key) : null;
      store.delete(key);
      return Promise.resolve(v);
    }),
  };
  getRedisClient.mockReturnValue(mockRedis);
});

// ── dekripsiBarisJemaat ───────────────────────────────────────────
describe('report.service — dekripsiBarisJemaat (Unit Test)', () => {
  it('harus dekripsi no_hp, alamat, dan media_sosial jika ada IV', () => {
    const row = {
      id: 1, nama: 'Budi',
      no_hp: 'encrypted_hp', no_hp_iv: 'iv1',
      alamat: 'encrypted_addr', alamat_iv: 'iv2',
      media_sosial: 'encrypted_medsos', media_sosial_iv: 'iv3',
    };
    const result = dekripsiBarisJemaat(row);
    expect(result.no_hp).toBe('decrypted:encrypted_hp');
    expect(result.alamat).toBe('decrypted:encrypted_addr');
    expect(result.media_sosial).toBe(JSON.stringify({ instagram: 'decrypted:encrypted_medsos' }));
    expect(result.no_hp_iv).toBeUndefined();
    expect(result.alamat_iv).toBeUndefined();
    expect(result.media_sosial_iv).toBeUndefined();
  });

  it('harus return [DECRYPT_ERROR] jika dekripsi gagal', () => {
    decrypt.mockImplementation(() => { throw new Error('Bad decrypt'); });
    decryptJson.mockImplementation(() => { throw new Error('Bad decrypt'); });
    const row = {
      id: 1, nama: 'Budi',
      no_hp: 'enc', no_hp_iv: 'iv', alamat: 'enc', alamat_iv: 'iv',
      media_sosial: 'enc', media_sosial_iv: 'iv',
    };
    const result = dekripsiBarisJemaat(row);
    expect(result.no_hp).toBe('[DECRYPT_ERROR]');
    expect(result.alamat).toBe('[DECRYPT_ERROR]');
    expect(result.media_sosial).toBe('[DECRYPT_ERROR]');
  });
});

// ── generateSignedToken & consumeSignedToken ──────────────────────
describe('report.service — signed token (Unit Test, Redis-backed)', () => {
  it('token yang valid harus bisa dikonsumsi 1x', async () => {
    const token = await generateSignedToken('test-file.xlsx');
    const result = await consumeSignedToken(token);
    expect(result).not.toBeNull();
    expect(result.fileName).toBe('test-file.xlsx');
  });

  it('harus menyimpan token di Redis dengan key signed_url:{token} dan TTL 900s', async () => {
    const token = await generateSignedToken('ttl-file.xlsx');
    expect(mockRedis.set).toHaveBeenCalledWith(
      `signed_url:${token}`,
      JSON.stringify({ fileName: 'ttl-file.xlsx' }),
      'EX',
      900
    );
  });

  it('token yang sudah dipakai tidak bisa dipakai lagi (GETDEL one-time)', async () => {
    const token = await generateSignedToken('test-file2.xlsx');
    await consumeSignedToken(token); // pakai pertama
    const result = await consumeSignedToken(token); // pakai kedua
    expect(result).toBeNull();
  });

  it('token yang tidak ada harus return null', async () => {
    expect(await consumeSignedToken('invalid-token-xyz')).toBeNull();
  });
});

// ── writeRowsToXlsx ────────────────────────────────────────────────
describe('report.service — writeRowsToXlsx (Unit Test)', () => {
  it('harus menghasilkan file xlsx valid yang bisa dibaca ulang dengan jumlah baris sesuai data', async () => {
    const columns = [{ header: 'ID', key: 'id' }, { header: 'Nama', key: 'nama' }];
    const rows = [{ id: 1, nama: 'Budi' }, { id: 2, nama: 'Cindy' }];

    const sink = new PassThrough();
    const getBuffer = collectStream(sink);
    await writeRowsToXlsx(sink, columns, rows);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(getBuffer());
    const worksheet = workbook.worksheets[0];

    expect(worksheet.rowCount).toBe(3); // header + 2 baris data
    expect(worksheet.getRow(1).getCell(1).value).toBe('ID');
    expect(worksheet.getRow(1).font.bold).toBe(true);
    expect(worksheet.getRow(2).getCell(2).value).toBe('Budi');
    expect(worksheet.getRow(3).getCell(2).value).toBe('Cindy');
  });

  it('harus menulis file kosong (hanya header) jika rows kosong', async () => {
    const columns = [{ header: 'ID', key: 'id' }];
    const sink = new PassThrough();
    const getBuffer = collectStream(sink);
    await writeRowsToXlsx(sink, columns, []);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(getBuffer());
    expect(workbook.worksheets[0].rowCount).toBe(1);
  });
});

// ── writeRowsToPdf ─────────────────────────────────────────────────
describe('report.service — writeRowsToPdf (Unit Test)', () => {
  it('harus menghasilkan file pdf valid (magic bytes %PDF-)', async () => {
    const columns = [{ header: 'ID', key: 'id' }];
    const rows = [{ id: 1 }];
    const sink = new PassThrough();
    const getBuffer = collectStream(sink);
    await writeRowsToPdf(sink, columns, rows);

    expect(getBuffer().subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('harus paginasi otomatis jika data melebihi satu halaman', async () => {
    const columns = [{ header: 'ID', key: 'id' }, { header: 'Nama', key: 'nama' }];
    const rows = Array.from({ length: 120 }, (_, i) => ({ id: i, nama: `Jemaat ${i}` }));
    const sink = new PassThrough();
    const getBuffer = collectStream(sink);
    await writeRowsToPdf(sink, columns, rows);

    const pdfText = getBuffer().toString('latin1');
    const pageMatches = pdfText.match(/\/Type\s*\/Page[^s]/g) || [];
    expect(pageMatches.length).toBeGreaterThan(1);
  });
});

// ── generateJemaatReport (format xlsx/pdf) ────────────────────────
describe('report.service — generateJemaatReport format ekspor (Unit Test)', () => {
  const cleanupFiles = [];
  afterEach(() => {
    while (cleanupFiles.length) {
      const f = cleanupFiles.pop();
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  });

  it('default format tanpa query param harus xlsx', async () => {
    reportRepository.countJemaat.mockResolvedValue(1);
    reportRepository.getJemaatReport.mockResolvedValue([
      { id: 1, nama: 'Budi', no_hp: null, no_hp_iv: null, alamat: null, alamat_iv: null },
    ]);

    const result = await generateJemaatReport({}, { actorUserId: 1 });
    cleanupFiles.push(result.filePath);

    expect(result.async).toBe(false);
    expect(result.fileName).toMatch(/\.xlsx$/);
    expect(fs.existsSync(result.filePath)).toBe(true);
  });

  it('format=pdf harus menghasilkan file .pdf', async () => {
    reportRepository.countJemaat.mockResolvedValue(1);
    reportRepository.getJemaatReport.mockResolvedValue([
      { id: 1, nama: 'Budi', no_hp: null, no_hp_iv: null, alamat: null, alamat_iv: null },
    ]);

    const result = await generateJemaatReport({ format: 'pdf' }, { actorUserId: 1 });
    cleanupFiles.push(result.filePath);

    expect(result.fileName).toMatch(/\.pdf$/);
    const buffer = fs.readFileSync(result.filePath);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('format selain xlsx/pdf harus melempar ReportError 400', async () => {
    await expect(generateJemaatReport({ format: 'csv' }, { actorUserId: 1 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('total >= 500 harus tetap async (signed token), bukan langsung file', async () => {
    reportRepository.countJemaat.mockResolvedValue(500);
    reportRepository.getJemaatReport.mockResolvedValue(
      Array(500).fill({ id: 1, nama: 'Test', no_hp: null, no_hp_iv: null, alamat: null, alamat_iv: null })
    );

    const result = await generateJemaatReport({}, { actorUserId: 1 });

    expect(result.async).toBe(true);
    expect(result).toHaveProperty('token');
  });

  it('data sensitif (no_hp, alamat, media_sosial) SELALU disertakan sebagai plaintext hasil dekripsi, bukan ciphertext', async () => {
    reportRepository.countJemaat.mockResolvedValue(1);
    reportRepository.getJemaatReport.mockResolvedValue([
      {
        id: 1, nama: 'Budi',
        no_hp: 'ciphertext_hp', no_hp_iv: 'iv1',
        alamat: 'ciphertext_addr', alamat_iv: 'iv2',
        media_sosial: 'ciphertext_medsos', media_sosial_iv: 'iv3',
      },
    ]);

    const result = await generateJemaatReport({ format: 'xlsx' }, { actorUserId: 1 });
    cleanupFiles.push(result.filePath);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(result.filePath);
    const worksheet = workbook.worksheets[0];

    const headers = worksheet.getRow(1).values.filter((v) => v !== undefined && v !== null);
    expect(headers).toContain('No HP');
    expect(headers).toContain('Alamat');
    expect(headers).toContain('Media Sosial');

    const values = worksheet.getRow(2).values.filter((v) => v !== undefined && v !== null);
    expect(values).toContain('decrypted:ciphertext_hp');
    expect(values).toContain('decrypted:ciphertext_addr');
    expect(values).toContain(JSON.stringify({ instagram: 'decrypted:ciphertext_medsos' }));
    expect(values).not.toContain('ciphertext_hp');
    expect(values).not.toContain('ciphertext_medsos');
  });

  it('mencatat audit log EXPORT/LAPORAN', async () => {
    reportRepository.countJemaat.mockResolvedValue(1);
    reportRepository.getJemaatReport.mockResolvedValue([
      { id: 1, nama: 'Budi', no_hp: null, no_hp_iv: null, alamat: null, alamat_iv: null },
    ]);

    const result = await generateJemaatReport({}, { actorUserId: 1 });
    cleanupFiles.push(result.filePath);

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'EXPORT', modul: 'LAPORAN' })
    );
  });
});

// ── generateEventReport / CG / Volunteer / Analytics — format ─────
describe('report.service — laporan lain (event/cg/volunteer/analytics) format ekspor (Unit Test)', () => {
  const cleanupFiles = [];
  afterEach(() => {
    while (cleanupFiles.length) {
      const f = cleanupFiles.pop();
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  });

  it('generateEventReport default xlsx dan mencatat audit log', async () => {
    reportRepository.getEventKehadiranReport.mockResolvedValue([
      { event_id: 1, judul: 'Ibadah', total_hadir: 100 },
    ]);

    const result = await generateEventReport({}, { actorUserId: 1 });
    cleanupFiles.push(result.filePath);

    expect(result.async).toBe(false);
    expect(result.fileName).toMatch(/\.xlsx$/);
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'EXPORT', modul: 'LAPORAN' })
    );
  });

  it('generateCGReport format=pdf menghasilkan file .pdf', async () => {
    reportRepository.getCGKehadiranReport.mockResolvedValue([
      { nama_cg: 'CG Alpha', nama_jemaat: 'Budi', hadir: true },
    ]);

    const result = await generateCGReport({ format: 'pdf' }, { actorUserId: 1 });
    cleanupFiles.push(result.filePath);

    expect(result.fileName).toMatch(/\.pdf$/);
  });

  it('generateVolunteerReport format tidak valid harus 400', async () => {
    await expect(generateVolunteerReport({ format: 'json' }, { actorUserId: 1 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('generateAnalyticsReport default xlsx', async () => {
    reportRepository.getAnalyticsReport.mockResolvedValue([
      { periode: '2026-01', jemaat_baru: 5, masih_aktif: 4 },
    ]);

    const result = await generateAnalyticsReport({ bulan: 6 }, { actorUserId: 1 });
    cleanupFiles.push(result.filePath);

    expect(result.fileName).toMatch(/\.xlsx$/);
  });
});

// ── EKSPOR_DATA_MALAM ─────────────────────────────────────────────
describe('report.service — notifikasi EKSPOR_DATA_MALAM (Unit Test)', () => {
  it('isOutsideOperationalHours: sebelum 06:00 dan mulai 22:00 dianggap di luar jam operasional', () => {
    expect(isOutsideOperationalHours(0)).toBe(true);
    expect(isOutsideOperationalHours(5)).toBe(true);
    expect(isOutsideOperationalHours(6)).toBe(false);
    expect(isOutsideOperationalHours(12)).toBe(false);
    expect(isOutsideOperationalHours(21)).toBe(false);
    expect(isOutsideOperationalHours(22)).toBe(true);
    expect(isOutsideOperationalHours(23)).toBe(true);
  });

  it('generate laporan di luar jam operasional → notifyLeaders EKSPOR_DATA_MALAM dengan info user & jenis', async () => {
    const hoursSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(23);
    reportRepository.getAnalyticsReport.mockResolvedValue([]);

    await generateAnalyticsReport({ bulan: 6, format: 'xlsx' }, { actorUserId: 7 });

    expect(notifyLeaders).toHaveBeenCalledWith(
      expect.objectContaining({
        jenis: 'EKSPOR_DATA_MALAM',
        pesan: expect.stringContaining('ANALYTICS'),
      })
    );
    expect(notifyLeaders.mock.calls[0][0].pesan).toContain('7');

    hoursSpy.mockRestore();
  });

  it('generate laporan di dalam jam operasional → tidak ada notifikasi', async () => {
    const hoursSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(10);
    reportRepository.getAnalyticsReport.mockResolvedValue([]);

    await generateAnalyticsReport({ bulan: 6, format: 'xlsx' }, { actorUserId: 7 });

    expect(notifyLeaders).not.toHaveBeenCalled();

    hoursSpy.mockRestore();
  });
});
