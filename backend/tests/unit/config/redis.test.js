jest.mock('ioredis');
const Redis = require('ioredis');
const fs = require('fs');
const {
  getRedisClient,
  testRedisConnection,
  closeRedis,
  buildTlsOptions,
} = require('../../../src/config/redis');

describe('config/redis — getRedisClient (Unit Test)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await closeRedis();
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    delete process.env.REDIS_USERNAME;
    delete process.env.REDIS_PASSWORD;
    delete process.env.REDIS_TLS_ENABLED;
    delete process.env.REDIS_TLS_CA_PATH;
    Redis.mockImplementation(() => ({
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue(),
    }));
  });

  afterEach(async () => {
    await closeRedis();
  });

  it('harus membuat instance Redis dengan host dan port dari environment', () => {
    getRedisClient();
    expect(Redis).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'localhost', port: 6379 })
    );
  });

  it('harus mengembalikan instance yang sama setiap dipanggil (singleton)', () => {
    const clientA = getRedisClient();
    const clientB = getRedisClient();
    expect(clientA).toBe(clientB);
    expect(Redis).toHaveBeenCalledTimes(1);
  });

  it('harus menyertakan username jika REDIS_USERNAME diset', () => {
    process.env.REDIS_USERNAME = 'default';
    getRedisClient();
    expect(Redis).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'default' })
    );
  });

  it('harus menyertakan password jika REDIS_PASSWORD diset', () => {
    process.env.REDIS_PASSWORD = 'rahasia123';
    getRedisClient();
    expect(Redis).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'rahasia123' })
    );
  });

  it('password harus undefined jika REDIS_PASSWORD tidak diset', () => {
    delete process.env.REDIS_PASSWORD;
    getRedisClient();
    const calledConfig = Redis.mock.calls[0][0];
    expect(calledConfig.password).toBeUndefined();
  });

  it('tidak boleh menyertakan key tls jika REDIS_TLS_ENABLED bukan true', () => {
    delete process.env.REDIS_TLS_ENABLED;
    getRedisClient();
    const calledConfig = Redis.mock.calls[0][0];
    expect(calledConfig.tls).toBeUndefined();
  });

  it('harus menyertakan key tls jika REDIS_TLS_ENABLED=true (tanpa CA path)', () => {
    process.env.REDIS_TLS_ENABLED = 'true';
    getRedisClient();
    expect(Redis).toHaveBeenCalledWith(
      expect.objectContaining({ tls: {} })
    );
  });
});

describe('config/redis — buildTlsOptions (Unit Test)', () => {
  let existsSyncSpy, readFileSyncSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.REDIS_TLS_ENABLED;
    delete process.env.REDIS_TLS_CA_PATH;
  });

  afterEach(() => {
    if (existsSyncSpy) existsSyncSpy.mockRestore();
    if (readFileSyncSpy) readFileSyncSpy.mockRestore();
  });

  it('harus mengembalikan undefined jika REDIS_TLS_ENABLED bukan true', () => {
    delete process.env.REDIS_TLS_ENABLED;
    expect(buildTlsOptions()).toBeUndefined();
  });

  it('harus mengembalikan objek kosong jika TLS aktif tapi CA path tidak diset', () => {
    process.env.REDIS_TLS_ENABLED = 'true';
    delete process.env.REDIS_TLS_CA_PATH;
    expect(buildTlsOptions()).toEqual({});
  });

  it('harus melempar error jika CA path diset tapi file tidak ditemukan', () => {
    process.env.REDIS_TLS_ENABLED = 'true';
    process.env.REDIS_TLS_CA_PATH = 'src/config/certs/tidak-ada.pem';
    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    expect(() => buildTlsOptions()).toThrow(/tidak ditemukan/);
  });

  it('harus mengembalikan ca jika file ditemukan', () => {
    process.env.REDIS_TLS_ENABLED = 'true';
    process.env.REDIS_TLS_CA_PATH = 'src/config/certs/redis-ca.pem';
    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue('FAKE-CA-CONTENT');

    const result = buildTlsOptions();
    expect(result).toEqual({ ca: 'FAKE-CA-CONTENT' });
  });
});

describe('config/redis — testRedisConnection (Unit Test)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await closeRedis();
    process.env.REDIS_HOST = 'localhost';
    delete process.env.REDIS_TLS_ENABLED;
  });

  afterEach(async () => {
    await closeRedis();
  });

  it('harus mengembalikan true jika PING berhasil', async () => {
    Redis.mockImplementation(() => ({
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue(),
    }));

    const result = await testRedisConnection();
    expect(result).toBe(true);
  });

  it('harus mengembalikan false jika PING mengembalikan nilai selain PONG', async () => {
    Redis.mockImplementation(() => ({
      ping: jest.fn().mockResolvedValue('SOMETHING_ELSE'),
      quit: jest.fn().mockResolvedValue(),
    }));

    const result = await testRedisConnection();
    expect(result).toBe(false);
  });
});

describe('config/redis — closeRedis (Unit Test)', () => {
  beforeEach(async () => {
    await closeRedis();
    process.env.REDIS_HOST = 'localhost';
    delete process.env.REDIS_TLS_ENABLED;
  });

  it('harus memanggil quit() jika client sudah dibuat', async () => {
    const mockQuit = jest.fn().mockResolvedValue();
    Redis.mockImplementation(() => ({ ping: jest.fn(), quit: mockQuit }));

    getRedisClient();
    await closeRedis();

    expect(mockQuit).toHaveBeenCalled();
  });

  it('tidak boleh error jika dipanggil sebelum client pernah dibuat', async () => {
    await expect(closeRedis()).resolves.not.toThrow();
  });
});