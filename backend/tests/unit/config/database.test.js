jest.mock('mysql2/promise');

const mysql = require('mysql2/promise');
const fs = require('fs');
const {
  getPool,
  testConnection,
  closePool,
  buildSslOptions,
} = require('../../../src/config/database');

describe('config/database — getPool (Unit Test)', () => {
  let mockPoolInstance;
  let existsSyncSpy;

  beforeEach(async () => {
    jest.clearAllMocks();
    await closePool();

    mockPoolInstance = {
      end: jest.fn().mockResolvedValue(),
      getConnection: jest.fn(),
      query: jest.fn(),
      on: jest.fn(),
    };
    mysql.createPool = jest.fn().mockReturnValue(mockPoolInstance);

    delete process.env.DB_SSL_CA_PATH;
    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    process.env.DB_HOST = 'localhost';
    process.env.DB_PORT = '4000';
    process.env.DB_USER = 'test_user';
    process.env.DB_PASSWORD = 'test_pass';
    process.env.DB_NAME = 'gods_dna_cms_test';
  });

  afterEach(async () => {
    existsSyncSpy.mockRestore();
    delete process.env.DB_POOL_SIZE;
    delete process.env.DB_SSL_CA_PATH;
    await closePool();
  });

  it('harus memanggil mysql.createPool dengan konfigurasi dari environment', () => {
    getPool();
    expect(mysql.createPool).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'localhost',
        port: 4000,
        user: 'test_user',
        password: 'test_pass',
        database: 'gods_dna_cms_test',
        waitForConnections: true,
        namedPlaceholders: true,
      })
    );
  });

  it('harus mengembalikan pool instance yang sama setiap dipanggil (singleton)', () => {
    const poolA = getPool();
    const poolB = getPool();
    expect(poolA).toBe(poolB);
    expect(mysql.createPool).toHaveBeenCalledTimes(1);
  });

  it('connectionLimit harus default 10 jika DB_POOL_SIZE tidak diset', () => {
    delete process.env.DB_POOL_SIZE;
    getPool();
    expect(mysql.createPool).toHaveBeenCalledWith(
      expect.objectContaining({ connectionLimit: 10 })
    );
  });

  it('connectionLimit harus mengikuti DB_POOL_SIZE jika diset', () => {
    process.env.DB_POOL_SIZE = '20';
    getPool();
    expect(mysql.createPool).toHaveBeenCalledWith(
      expect.objectContaining({ connectionLimit: 20 })
    );
  });

  it('harus mengaktifkan keepalive & connectTimeout (fix ECONNRESET koneksi idle)', () => {
    getPool();
    expect(mysql.createPool).toHaveBeenCalledWith(
      expect.objectContaining({
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        connectTimeout: 10000,
      })
    );
  });

  it('harus mendaftarkan listener error di pool', () => {
    getPool();
    expect(mockPoolInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
  });
});

describe('config/database — retry query pada error koneksi transien (Unit Test)', () => {
  let mockPoolInstance;
  let existsSyncSpy;

  beforeEach(async () => {
    jest.clearAllMocks();
    await closePool();
    mockPoolInstance = { end: jest.fn().mockResolvedValue(), getConnection: jest.fn(), on: jest.fn() };
    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    delete process.env.DB_SSL_CA_PATH;
    process.env.DB_HOST = 'localhost';
    process.env.DB_NAME = 'gods_dna_cms_test';
  });

  afterEach(async () => {
    existsSyncSpy.mockRestore();
    await closePool();
  });

  it('harus retry sekali dan berhasil kalau gagal pertama karena ECONNRESET', async () => {
    const err = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    // getPool() mengganti mockPoolInstance.query dengan wrapper-nya sendiri —
    // simpan referensi jest.fn() ASLI dulu supaya assertion .toHaveBeenCalledTimes
    // tetap mengacu ke mock, bukan ke fungsi wrapper yang menimpanya.
    const originalQueryMock = jest.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce([[{ ok: 1 }]]);
    mockPoolInstance.query = originalQueryMock;
    mysql.createPool = jest.fn().mockReturnValue(mockPoolInstance);

    const pool = getPool();
    const result = await pool.query('SELECT 1');

    expect(result).toEqual([[{ ok: 1 }]]);
    expect(originalQueryMock).toHaveBeenCalledTimes(2);
  });

  it('tidak boleh retry untuk error non-koneksi (mis. syntax SQL) — langsung dilempar', async () => {
    const err = Object.assign(new Error('SQL syntax error'), { code: 'ER_PARSE_ERROR' });
    const originalQueryMock = jest.fn().mockRejectedValue(err);
    mockPoolInstance.query = originalQueryMock;
    mysql.createPool = jest.fn().mockReturnValue(mockPoolInstance);

    const pool = getPool();

    await expect(pool.query('SELECT bad')).rejects.toThrow('SQL syntax error');
    expect(originalQueryMock).toHaveBeenCalledTimes(1);
  });

  it('kalau retry juga gagal, error dari percobaan kedua yang dilempar (bukan retry berulang)', async () => {
    const err1 = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    const err2 = Object.assign(new Error('read ECONNRESET lagi'), { code: 'ECONNRESET' });
    const originalQueryMock = jest.fn()
      .mockRejectedValueOnce(err1)
      .mockRejectedValueOnce(err2);
    mockPoolInstance.query = originalQueryMock;
    mysql.createPool = jest.fn().mockReturnValue(mockPoolInstance);

    const pool = getPool();

    await expect(pool.query('SELECT 1')).rejects.toThrow('read ECONNRESET lagi');
    expect(originalQueryMock).toHaveBeenCalledTimes(2);
  });
});

describe('config/database — testConnection (Unit Test)', () => {
  let existsSyncSpy;

  beforeEach(async () => {
    jest.clearAllMocks();
    await closePool();
    delete process.env.DB_SSL_CA_PATH;
    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    process.env.DB_HOST = 'localhost';
    process.env.DB_NAME = 'gods_dna_cms_test';
  });

  afterEach(async () => {
    existsSyncSpy.mockRestore();
    await closePool();
  });

  it('harus mengembalikan true jika query SELECT 1 berhasil', async () => {
    const mockConnection = {
      query: jest.fn().mockResolvedValue([[{ '1': 1 }]]),
      release: jest.fn(),
    };
    const mockPoolInstance = {
      getConnection: jest.fn().mockResolvedValue(mockConnection),
      end: jest.fn().mockResolvedValue(),
      query: jest.fn(),
      on: jest.fn(),
    };
    mysql.createPool = jest.fn().mockReturnValue(mockPoolInstance);

    const result = await testConnection();

    expect(result).toBe(true);
    expect(mockConnection.query).toHaveBeenCalledWith('SELECT 1');
    expect(mockConnection.release).toHaveBeenCalled();
  });

  it('harus melepas koneksi (release) walaupun query gagal', async () => {
    const mockConnection = {
      query: jest.fn().mockRejectedValue(new Error('Connection refused')),
      release: jest.fn(),
    };
    const mockPoolInstance = {
      getConnection: jest.fn().mockResolvedValue(mockConnection),
      end: jest.fn().mockResolvedValue(),
      query: jest.fn(),
      on: jest.fn(),
    };
    mysql.createPool = jest.fn().mockReturnValue(mockPoolInstance);

    await expect(testConnection()).rejects.toThrow('Connection refused');
    expect(mockConnection.release).toHaveBeenCalled();
  });
});

describe('config/database — closePool (Unit Test)', () => {
  let existsSyncSpy;

  beforeEach(async () => {
    jest.clearAllMocks();
    await closePool();
    delete process.env.DB_SSL_CA_PATH;
    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    process.env.DB_HOST = 'localhost';
    process.env.DB_NAME = 'gods_dna_cms_test';
  });

  afterEach(async () => {
    existsSyncSpy.mockRestore();
    await closePool();
  });

  it('harus memanggil pool.end() jika pool sudah dibuat', async () => {
    const mockPoolInstance = {
      end: jest.fn().mockResolvedValue(),
      getConnection: jest.fn(),
      query: jest.fn(),
      on: jest.fn(),
    };
    mysql.createPool = jest.fn().mockReturnValue(mockPoolInstance);

    getPool();
    await closePool();

    expect(mockPoolInstance.end).toHaveBeenCalled();
  });

  it('tidak boleh error jika closePool dipanggil sebelum pool pernah dibuat', async () => {
    await expect(closePool()).resolves.not.toThrow();
  });
});

describe('config/database — buildSslOptions (Unit Test)', () => {
  let existsSyncSpy, readFileSyncSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.DB_SSL_CA_PATH;
  });

  afterEach(() => {
    if (existsSyncSpy) existsSyncSpy.mockRestore();
    if (readFileSyncSpy) readFileSyncSpy.mockRestore();
    delete process.env.DB_SSL_CA_PATH;
  });

  it('harus mengembalikan undefined jika DB_SSL_CA_PATH tidak diset', () => {
    delete process.env.DB_SSL_CA_PATH;
    expect(buildSslOptions()).toBeUndefined();
  });

  it('harus melempar error jelas jika DB_SSL_CA_PATH diset tapi file tidak ditemukan', () => {
    process.env.DB_SSL_CA_PATH = 'src/config/certs/tidak-ada.pem';
    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(() => buildSslOptions()).toThrow(/tidak ditemukan/);
  });

  it('harus mengembalikan objek ssl dengan isi ca.pem jika file ditemukan', () => {
    process.env.DB_SSL_CA_PATH = 'src/config/certs/ca.pem';
    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    readFileSyncSpy = jest
      .spyOn(fs, 'readFileSync')
      .mockReturnValue('--- FAKE CA CONTENT ---');

    const result = buildSslOptions();

    expect(result).toEqual({
      ca: '--- FAKE CA CONTENT ---',
      minVersion: 'TLSv1.2',
    });
  });
});

describe('config/database — getPool dengan SSL (Unit Test)', () => {
  let existsSyncSpy, readFileSyncSpy;

  beforeEach(async () => {
    jest.clearAllMocks();
    await closePool();
    process.env.DB_HOST = 'localhost';
    process.env.DB_NAME = 'gods_dna_cms_test';
  });

  afterEach(async () => {
    if (existsSyncSpy) existsSyncSpy.mockRestore();
    if (readFileSyncSpy) readFileSyncSpy.mockRestore();
    delete process.env.DB_SSL_CA_PATH;
    await closePool();
  });

  it('harus menyertakan opsi ssl di createPool jika DB_SSL_CA_PATH valid', () => {
    process.env.DB_SSL_CA_PATH = 'src/config/certs/ca.pem';
    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue('fake-ca');
    mysql.createPool = jest.fn().mockReturnValue({
      end: jest.fn().mockResolvedValue(),
      query: jest.fn(),
      on: jest.fn(),
    });

    getPool();

    expect(mysql.createPool).toHaveBeenCalledWith(
      expect.objectContaining({
        ssl: { ca: 'fake-ca', minVersion: 'TLSv1.2' },
      })
    );
  });

  it('tidak boleh menyertakan key ssl di createPool jika DB_SSL_CA_PATH tidak diset', () => {
    delete process.env.DB_SSL_CA_PATH;
    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    mysql.createPool = jest.fn().mockReturnValue({
      end: jest.fn().mockResolvedValue(),
      query: jest.fn(),
      on: jest.fn(),
    });

    getPool();

    const calledConfig = mysql.createPool.mock.calls[0][0];
    expect(calledConfig.ssl).toBeUndefined();
  });
});