jest.mock('../../../../src/modules/auth/auth.repository');
jest.mock('../../../../src/utils/password.util');
jest.mock('../../../../src/utils/jwt.util');
jest.mock('../../../../src/config/redis');
jest.mock('../../../../src/modules/auditlog/auditlog.repository');
jest.mock('../../../../src/modules/notification/notification.stub');

const authRepository = require('../../../../src/modules/auth/auth.repository');
const { comparePassword } = require('../../../../src/utils/password.util');
const {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} = require('../../../../src/utils/jwt.util');
const { getRedisClient } = require('../../../../src/config/redis');
const { recordAuditLog } = require('../../../../src/modules/auditlog/auditlog.repository');
const { notifyLeaders } = require('../../../../src/modules/notification/notification.stub');
const { login, logout, refreshAccessToken, AuthError } = require('../../../../src/modules/auth/auth.service');

describe('auth.service — login (Unit Test)', () => {
  let mockRedis;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
    };
    getRedisClient.mockReturnValue(mockRedis);
    signAccessToken.mockReturnValue('fake-access-token');
    signRefreshToken.mockReturnValue('fake-refresh-token');
    recordAuditLog.mockResolvedValue(1);
  });

  it('harus melempar AuthError 401 jika username tidak ditemukan', async () => {
    authRepository.findByUsername.mockResolvedValue(null);

    await expect(login({ username: 'tidakada', password: 'apapun' }))
      .rejects.toMatchObject({ statusCode: 401, message: 'Username atau password salah' });
  });

  it('harus melempar AuthError 403 jika akun tidak aktif', async () => {
    authRepository.findByUsername.mockResolvedValue({ id: 1, aktif: false });

    await expect(login({ username: 'user1', password: 'apapun' }))
      .rejects.toMatchObject({ statusCode: 403, message: 'Akun dinonaktifkan' });
  });

  it('harus melempar AuthError 429 jika failed_login_count >= 3 dan memanggil notifyLeaders', async () => {
    authRepository.findByUsername.mockResolvedValue({ id: 1, aktif: true });
    mockRedis.get.mockResolvedValueOnce('3');

    await expect(login({ username: 'user1', password: 'apapun' }))
      .rejects.toMatchObject({ statusCode: 429, message: 'Akun dikunci sementara' });

    expect(notifyLeaders).toHaveBeenCalledWith(
      expect.objectContaining({ jenis: 'LOGIN_GAGAL_BERULANG' })
    );
  });

  it('harus melempar AuthError 401 dan increment counter jika password salah', async () => {
    authRepository.findByUsername.mockResolvedValue({
      id: 1, aktif: true, password_hash: 'hashed',
    });
    mockRedis.get.mockResolvedValueOnce('0');
    comparePassword.mockResolvedValue(false);
    mockRedis.incr.mockResolvedValue(1);

    await expect(login({ username: 'user1', password: 'salah' }))
      .rejects.toMatchObject({ statusCode: 401 });

    expect(mockRedis.incr).toHaveBeenCalledWith('login_fail:user1');
    expect(mockRedis.expire).toHaveBeenCalledWith('login_fail:user1', 900);
  });

  it('tidak boleh set expire lagi jika incr menghasilkan counter > 1', async () => {
    authRepository.findByUsername.mockResolvedValue({
      id: 1, aktif: true, password_hash: 'hashed',
    });
    mockRedis.get.mockResolvedValueOnce('1');
    comparePassword.mockResolvedValue(false);
    mockRedis.incr.mockResolvedValue(2);

    await expect(login({ username: 'user1', password: 'salah' })).rejects.toThrow();

    expect(mockRedis.expire).not.toHaveBeenCalled();
  });

  it('harus berhasil login: reset counter, set session, simpan refresh token, update last_login, audit log', async () => {
    authRepository.findByUsername.mockResolvedValue({
      id: 7, aktif: true, password_hash: 'hashed', peran: 'ADMIN', username: 'admin1',
    });
    mockRedis.get.mockResolvedValueOnce('0').mockResolvedValueOnce(null);
    comparePassword.mockResolvedValue(true);

    const result = await login({ username: 'admin1', password: 'benar' });

    expect(mockRedis.del).toHaveBeenCalledWith('login_fail:admin1');
    expect(signAccessToken).toHaveBeenCalledWith({ userId: 7, peran: 'ADMIN' });
    expect(signRefreshToken).toHaveBeenCalledWith({ userId: 7 });
    expect(mockRedis.set).toHaveBeenCalledWith('active_session:7', 'fake-access-token', 'EX', 8 * 60 * 60);
    expect(mockRedis.set).toHaveBeenCalledWith('refresh_token:7', 'fake-refresh-token', 'EX', 7 * 24 * 60 * 60);
    expect(authRepository.updateLastLogin).toHaveBeenCalledWith(7);
    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, aksi: 'LOGIN', modul: 'AUTH' })
    );

    expect(result).toEqual({
      peran: 'ADMIN',
      nama: 'admin1',
      accessToken: 'fake-access-token',
      refreshToken: 'fake-refresh-token',
    });
  });

  it('harus blacklist token lama jika ada sesi aktif sebelumnya (single concurrent session)', async () => {
    authRepository.findByUsername.mockResolvedValue({
      id: 7, aktif: true, password_hash: 'hashed', peran: 'ADMIN', username: 'admin1',
    });
    mockRedis.get
      .mockResolvedValueOnce('0')
      .mockResolvedValueOnce('old-access-token-yang-masih-aktif');
    comparePassword.mockResolvedValue(true);

    await login({ username: 'admin1', password: 'benar' });

    expect(mockRedis.set).toHaveBeenCalledWith(
      'blacklist_token:old-access-token-yang-masih-aktif', '1', 'EX', 8 * 60 * 60
    );
  });
});

describe('auth.service — logout (Unit Test)', () => {
  let mockRedis;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = {
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    getRedisClient.mockReturnValue(mockRedis);
    recordAuditLog.mockResolvedValue(1);
  });

  it('harus blacklist token dengan TTL sesuai sisa masa berlaku, dan hapus active_session', async () => {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    verifyAccessToken.mockReturnValue({ userId: 5, peran: 'ADMIN', exp: nowInSeconds + 1000 });

    await logout('some-valid-token');

    expect(mockRedis.set).toHaveBeenCalledWith(
      'blacklist_token:some-valid-token', '1', 'EX', expect.any(Number)
    );
    const ttlUsed = mockRedis.set.mock.calls[0][3];
    expect(ttlUsed).toBeGreaterThan(900);
    expect(ttlUsed).toBeLessThanOrEqual(1000);

    expect(mockRedis.del).toHaveBeenCalledWith('active_session:5');
  });

  it('harus mencatat audit_log aksi=LOGOUT dengan userId dari token', async () => {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    verifyAccessToken.mockReturnValue({ userId: 9, peran: 'LEADER', exp: nowInSeconds + 500 });

    await logout('token-leader');

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 9, aksi: 'LOGOUT', modul: 'AUTH' })
    );
  });

  it('harus tetap berhasil logout (tidak throw) walau token sudah tidak valid/expired', async () => {
    verifyAccessToken.mockImplementation(() => {
      throw new Error('jwt expired');
    });

    await expect(logout('token-kadaluwarsa')).resolves.not.toThrow();

    expect(mockRedis.set).toHaveBeenCalledWith(
      'blacklist_token:token-kadaluwarsa', '1', 'EX', 8 * 60 * 60
    );
    expect(mockRedis.del).not.toHaveBeenCalled();
  });
});

describe('auth.service — refreshAccessToken (Unit Test)', () => {
  let mockRedis;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    getRedisClient.mockReturnValue(mockRedis);
    signAccessToken.mockReturnValue('new-access-token');
  });

  it('harus mengembalikan access token baru jika refresh token valid & cocok dengan Redis & user aktif', async () => {
    verifyRefreshToken.mockReturnValue({ userId: 7 });
    mockRedis.get.mockResolvedValue('refresh-token-cookie'); // refresh_token:7
    authRepository.findById.mockResolvedValue({ id: 7, peran: 'ADMIN', aktif: true });

    const result = await refreshAccessToken('refresh-token-cookie');

    expect(signAccessToken).toHaveBeenCalledWith({ userId: 7, peran: 'ADMIN' });
    expect(mockRedis.set).toHaveBeenCalledWith('active_session:7', 'new-access-token', 'EX', 8 * 60 * 60);
    expect(result).toEqual({ accessToken: 'new-access-token' });
  });

  it('harus 401 jika refresh token tidak valid / kedaluwarsa', async () => {
    verifyRefreshToken.mockImplementation(() => { throw new Error('jwt expired'); });

    await expect(refreshAccessToken('token-rusak'))
      .rejects.toMatchObject({ statusCode: 401 });
  });

  it('harus 401 jika refresh token tidak cocok dengan yang tersimpan di Redis', async () => {
    verifyRefreshToken.mockReturnValue({ userId: 7 });
    mockRedis.get.mockResolvedValue('refresh-token-lain'); // beda dengan cookie

    await expect(refreshAccessToken('refresh-token-cookie'))
      .rejects.toMatchObject({ statusCode: 401 });
  });

  it('harus 401 jika user sudah nonaktif', async () => {
    verifyRefreshToken.mockReturnValue({ userId: 7 });
    mockRedis.get.mockResolvedValue('refresh-token-cookie');
    authRepository.findById.mockResolvedValue({ id: 7, peran: 'ADMIN', aktif: false });

    await expect(refreshAccessToken('refresh-token-cookie'))
      .rejects.toMatchObject({ statusCode: 401 });
  });
});