jest.mock('../../../../src/config/database');
const { getPool } = require('../../../../src/config/database');
const {
  computeHmac,
  recordAuditLog,
  findByIdWithVerification,
} = require('../../../../src/modules/auditlog/auditlog.repository');

beforeAll(() => {
  process.env.AUDIT_HMAC_SECRET = 'test-hmac-secret';
});

afterAll(() => {
  process.env.AUDIT_HMAC_SECRET = 'test-hmac-secret';
});

describe('auditlog.repository — computeHmac (Unit Test)', () => {
  const fixedDate = new Date('2026-06-17T10:00:00.000Z');

  it('harus menghasilkan hex string 64 karakter (SHA-256)', () => {
    const hmac = computeHmac({
      id: 1,
      userId: 5,
      aksi: 'LOGIN',
      modul: 'AUTH',
      objectId: null,
      dataSebelum: null,
      dataSesudah: null,
      createdAt: fixedDate,
    });

    expect(hmac).toMatch(/^[a-f0-9]{64}$/);
  });

  it('harus deterministik untuk input yang sama', () => {
    const params = {
      id: 1, userId: 5, aksi: 'LOGIN', modul: 'AUTH', objectId: null,
      dataSebelum: null, dataSesudah: null, createdAt: fixedDate,
    };
    expect(computeHmac(params)).toBe(computeHmac(params));
  });

  it('harus menghasilkan hmac berbeda jika salah satu field berubah', () => {
    const base = {
      id: 1, userId: 5, aksi: 'LOGIN', modul: 'AUTH', objectId: null,
      dataSebelum: null, dataSesudah: null, createdAt: fixedDate,
    };
    const changed = { ...base, aksi: 'LOGOUT' };
    expect(computeHmac(base)).not.toBe(computeHmac(changed));
  });

  it('harus melempar error jika AUDIT_HMAC_SECRET tidak ada', () => {
    delete process.env.AUDIT_HMAC_SECRET;
    expect(() =>
      computeHmac({
        id: 1, userId: 5, aksi: 'LOGIN', modul: 'AUTH', objectId: null,
        dataSebelum: null, dataSesudah: null, createdAt: fixedDate,
      })
    ).toThrow('AUDIT_HMAC_SECRET belum dikonfigurasi');
    process.env.AUDIT_HMAC_SECRET = 'test-hmac-secret';
  });

  it('null userId dan objectId tidak boleh menghasilkan error', () => {
    expect(() =>
      computeHmac({
        id: 1, userId: null, aksi: 'LOGIN', modul: 'AUTH', objectId: null,
        dataSebelum: null, dataSesudah: null, createdAt: fixedDate,
      })
    ).not.toThrow();
  });
});

describe('auditlog.repository — recordAuditLog (Unit Test)', () => {
  it('harus INSERT lalu UPDATE hmac_signature, dan mengembalikan id', async () => {
    const mockPool = {
      query: jest.fn()
        .mockResolvedValueOnce([{ insertId: 1 }])                       
        .mockResolvedValueOnce([[{ created_at: new Date('2026-06-17T10:00:00.000Z') }]]) 
        .mockResolvedValueOnce([{ affectedRows: 1 }]),                    
    };
    getPool.mockReturnValue(mockPool);

    const id = await recordAuditLog({
      userId: 5, aksi: 'LOGIN', modul: 'AUTH',
      objectId: null, dataSebelum: null, dataSesudah: null,
    });

    expect(id).toBe(1);
    expect(mockPool.query).toHaveBeenCalledTimes(3);
    // Pastikan query ketiga adalah UPDATE hmac_signature
    expect(mockPool.query.mock.calls[2][0]).toMatch(/UPDATE audit_logs SET hmac_signature/);
  });

  it('data_sebelum dan data_sesudah harus di-JSON.stringify sebelum INSERT', async () => {
    const mockPool = {
      query: jest.fn()
        .mockResolvedValueOnce([{ insertId: 2 }])
        .mockResolvedValueOnce([[{ created_at: new Date('2026-06-17T10:00:00.000Z') }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    getPool.mockReturnValue(mockPool);

    await recordAuditLog({
      userId: 5, aksi: 'CREATE', modul: 'JEMAAT',
      dataSebelum: null,
      dataSesudah: { nama: 'Budi' },
    });

    const insertCall = mockPool.query.mock.calls[0];
    expect(insertCall[1].dataSesudah).toBe('{"nama":"Budi"}');
  });
});

describe('auditlog.repository — findByIdWithVerification (Unit Test)', () => {
  it('harus mengembalikan null jika tidak ditemukan', async () => {
    const mockPool = { query: jest.fn().mockResolvedValue([[]]) };
    getPool.mockReturnValue(mockPool);

    const result = await findByIdWithVerification(999);
    expect(result).toBeNull();
  });

  it('harus mengembalikan isTampered=false jika hmac cocok', async () => {
    const fixedDate = new Date('2026-06-17T10:00:00.000Z');
    const validHmac = computeHmac({
      id: 1, userId: 5, aksi: 'LOGIN', modul: 'AUTH', objectId: null,
      dataSebelum: null, dataSesudah: null, createdAt: fixedDate,
    });

    const mockPool = {
      query: jest.fn().mockResolvedValue([[{
        id: 1, user_id: 5, aksi: 'LOGIN', modul: 'AUTH', object_id: null,
        data_sebelum: null, data_sesudah: null,
        hmac_signature: validHmac, created_at: fixedDate.toISOString(),
      }]]),
    };
    getPool.mockReturnValue(mockPool);

    const result = await findByIdWithVerification(1);
    expect(result.isTampered).toBe(false);
  });

  it('harus mengembalikan isTampered=true jika hmac TIDAK cocok (data dimanipulasi)', async () => {
    const fixedDate = new Date('2026-06-17T10:00:00.000Z');

    const mockPool = {
      query: jest.fn().mockResolvedValue([[{
        id: 1, user_id: 5, aksi: 'LOGIN', modul: 'AUTH', object_id: null,
        data_sebelum: null, data_sesudah: null,
        hmac_signature: 'hmac-yang-sudah-dipalsukan',
        created_at: fixedDate.toISOString(),
      }]]),
    };
    getPool.mockReturnValue(mockPool);

    const result = await findByIdWithVerification(1);
    expect(result.isTampered).toBe(true);
  });
});