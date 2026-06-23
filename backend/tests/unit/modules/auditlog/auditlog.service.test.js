jest.mock('../../../../src/modules/auditlog/auditlog.repository');
const auditlogRepository = require('../../../../src/modules/auditlog/auditlog.repository');
const { verifyHmac, listAuditLogs, getAuditLogById } = require('../../../../src/modules/auditlog/auditlog.service');
const crypto = require('crypto');

// Helper: buat row valid dengan HMAC yang benar
function makeValidRow(overrides = {}) {
  const row = {
    id: 1,
    user_id: 2,
    aksi: 'CREATE',
    modul: 'JEMAAT',
    object_id: 10,
    data_sebelum: null,
    data_sesudah: JSON.stringify({ nama: 'Budi' }),
    created_at: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  };

  const secret = process.env.AUDIT_HMAC_SECRET || 'test-secret';
  const createdAt = row.created_at instanceof Date
    ? row.created_at.toISOString()
    : new Date(row.created_at).toISOString();

  const message = [
    String(row.id),
    String(row.user_id ?? ''),
    String(row.aksi ?? ''),
    String(row.modul ?? ''),
    String(row.object_id ?? ''),
    JSON.stringify(row.data_sebelum ?? null),
    JSON.stringify(row.data_sesudah ?? null),
    createdAt,
  ].join('');

  row.hmac_signature = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');

  return row;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.AUDIT_HMAC_SECRET = 'test-secret';
});

// ── verifyHmac ────────────────────────────────────────────────────
describe('auditlog.service — verifyHmac (Unit Test)', () => {
  it('harus return valid=true untuk HMAC yang benar', () => {
    const row = makeValidRow();
    const result = verifyHmac(row);
    expect(result.valid).toBe(true);
    expect(result.status).toBe('OK');
  });

  it('harus return valid=false untuk HMAC yang dimanipulasi', () => {
    const row = makeValidRow();
    row.hmac_signature = 'tampered_signature';
    const result = verifyHmac(row);
    expect(result.valid).toBe(false);
    expect(result.status).toBe('POTENTIALLY_TAMPERED');
  });

  it('harus return valid=false jika data_sesudah diubah setelah HMAC dibuat', () => {
    const row = makeValidRow();
    row.data_sesudah = JSON.stringify({ nama: 'Budi Diubah' }); // data dimanipulasi
    const result = verifyHmac(row);
    expect(result.valid).toBe(false);
    expect(result.status).toBe('POTENTIALLY_TAMPERED');
  });

  it('harus return NO_SECRET jika AUDIT_HMAC_SECRET tidak ada', () => {
    delete process.env.AUDIT_HMAC_SECRET;
    const row = makeValidRow();
    const result = verifyHmac(row);
    expect(result.valid).toBe(false);
    expect(result.status).toBe('NO_SECRET');
  });
});

// ── listAuditLogs ─────────────────────────────────────────────────
describe('auditlog.service — listAuditLogs (Unit Test)', () => {
  it('harus mengembalikan array dengan field hmac_valid dan hmac_status', async () => {
    const row = makeValidRow();
    auditlogRepository.findAll.mockResolvedValue([row]);

    const result = await listAuditLogs({});

    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty('hmac_valid', true);
    expect(result[0]).toHaveProperty('hmac_status', 'OK');
  });

  it('harus parse data_sebelum dan data_sesudah dari JSON string', async () => {
    const row = makeValidRow({ data_sesudah: JSON.stringify({ nama: 'Budi' }) });
    auditlogRepository.findAll.mockResolvedValue([row]);

    const result = await listAuditLogs({});

    expect(typeof result[0].data_sesudah).toBe('object');
    expect(result[0].data_sesudah.nama).toBe('Budi');
  });

  it('harus menandai baris yang HMAC-nya tidak cocok sebagai POTENTIALLY_TAMPERED', async () => {
    const row = makeValidRow();
    row.hmac_signature = 'tampered';
    auditlogRepository.findAll.mockResolvedValue([row]);

    const result = await listAuditLogs({});

    expect(result[0].hmac_valid).toBe(false);
    expect(result[0].hmac_status).toBe('POTENTIALLY_TAMPERED');
  });
});

// ── getAuditLogById ───────────────────────────────────────────────
describe('auditlog.service — getAuditLogById (Unit Test)', () => {
  it('harus mengembalikan null jika tidak ditemukan', async () => {
    auditlogRepository.findById.mockResolvedValue(null);
    const result = await getAuditLogById(999);
    expect(result).toBeNull();
  });

  it('harus mengembalikan log dengan hmac_valid jika ditemukan', async () => {
    const row = makeValidRow();
    auditlogRepository.findById.mockResolvedValue(row);

    const result = await getAuditLogById(1);

    expect(result.id).toBe(1);
    expect(result.hmac_valid).toBe(true);
    expect(result.hmac_status).toBe('OK');
  });
});