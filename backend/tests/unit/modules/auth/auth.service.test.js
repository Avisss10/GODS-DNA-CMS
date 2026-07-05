jest.mock('../../../../src/modules/auth/auth.repository');
jest.mock('../../../../src/utils/password.util');
jest.mock('../../../../src/utils/jwt.util');
jest.mock('../../../../src/config/redis');
jest.mock('../../../../src/modules/auditlog/auditlog.repository');
jest.mock('../../../../src/modules/notification/notification.stub');

const authRepository = require('../../../../src/modules/auth/auth.repository');
const { comparePassword, hashPassword } = require('../../../../src/utils/password.util');
const {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} = require('../../../../src/utils/jwt.util');
const { getRedisClient } = require('../../../../src/config/redis');
const { recordAuditLog } = require('../../../../src/modules/auditlog/auditlog.repository');
const { notifyLeaders } = require('../../../../src/modules/notification/notification.stub');
const {
  login, logout, refreshAccessToken, createUser, updateUserStatus, AuthError,
} = require('../../../../src/modules/auth/auth.service');

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

describe('auth.service — createUser (Unit Test)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    recordAuditLog.mockResolvedValue(1);
  });

  it('harus berhasil membuat user baru dan tidak mengembalikan password_hash', async () => {
    authRepository.findByUsername.mockResolvedValue(null);
    hashPassword.mockResolvedValue('hashed-password');
    authRepository.createUser.mockResolvedValue(42);

    const result = await createUser(
      { username: 'admin_baru', password: 'PasswordBaru123', peran: 'ADMIN' },
      { actorUserId: 1 }
    );

    expect(result).toEqual({ id: 42, username: 'admin_baru', peran: 'ADMIN' });
    expect(result.password_hash).toBeUndefined();
    expect(hashPassword).toHaveBeenCalledWith('PasswordBaru123');
    expect(authRepository.createUser).toHaveBeenCalledWith({
      username: 'admin_baru', passwordHash: 'hashed-password', peran: 'ADMIN',
    });
  });

  it('harus mencatat audit log CREATE_USER/USER', async () => {
    authRepository.findByUsername.mockResolvedValue(null);
    hashPassword.mockResolvedValue('hashed-password');
    authRepository.createUser.mockResolvedValue(42);

    await createUser({ username: 'admin_baru', password: 'PasswordBaru123', peran: 'ADMIN' }, { actorUserId: 1 });

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, aksi: 'CREATE_USER', modul: 'USER' })
    );
  });

  it('harus 409 jika username sudah terdaftar', async () => {
    authRepository.findByUsername.mockResolvedValue({ id: 1, username: 'admin_lama' });

    await expect(createUser({ username: 'admin_lama', password: 'PasswordBaru123', peran: 'ADMIN' }, { actorUserId: 1 }))
      .rejects.toMatchObject({ statusCode: 409 });

    expect(authRepository.createUser).not.toHaveBeenCalled();
  });
});

describe('auth.service — updateUserStatus (Unit Test)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    recordAuditLog.mockResolvedValue(1);
  });

  it('harus 404 jika user target tidak ditemukan', async () => {
    authRepository.findById.mockResolvedValue(null);

    await expect(updateUserStatus(99, false, { actorUserId: 1 }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('harus 400 jika menonaktifkan satu-satunya LEADER aktif', async () => {
    authRepository.findById.mockResolvedValue({ id: 5, username: 'leader1', peran: 'LEADER', aktif: true });
    authRepository.countActiveLeaders.mockResolvedValue(1);

    await expect(updateUserStatus(5, false, { actorUserId: 1 }))
      .rejects.toMatchObject({ statusCode: 400 });

    expect(authRepository.updateAktif).not.toHaveBeenCalled();
  });

  it('harus berhasil menonaktifkan LEADER jika masih ada LEADER aktif lain', async () => {
    authRepository.findById.mockResolvedValue({ id: 5, username: 'leader1', peran: 'LEADER', aktif: true });
    authRepository.countActiveLeaders.mockResolvedValue(2);

    const result = await updateUserStatus(5, false, { actorUserId: 1 });

    expect(authRepository.updateAktif).toHaveBeenCalledWith(5, false);
    expect(result).toEqual({ username: 'leader1' });
  });

  it('harus berhasil menonaktifkan ADMIN tanpa perlu cek countActiveLeaders', async () => {
    authRepository.findById.mockResolvedValue({ id: 6, username: 'admin1', peran: 'ADMIN', aktif: true });

    await updateUserStatus(6, false, { actorUserId: 1 });

    expect(authRepository.countActiveLeaders).not.toHaveBeenCalled();
    expect(authRepository.updateAktif).toHaveBeenCalledWith(6, false);
  });

  it('harus berhasil mengaktifkan kembali (reaktivasi) tanpa perlu safety check', async () => {
    authRepository.findById.mockResolvedValue({ id: 5, username: 'leader1', peran: 'LEADER', aktif: false });

    await updateUserStatus(5, true, { actorUserId: 1 });

    expect(authRepository.countActiveLeaders).not.toHaveBeenCalled();
    expect(authRepository.updateAktif).toHaveBeenCalledWith(5, true);
  });

  it('harus mencatat audit log DEACTIVATE_USER saat menonaktifkan', async () => {
    authRepository.findById.mockResolvedValue({ id: 6, username: 'admin1', peran: 'ADMIN', aktif: true });

    await updateUserStatus(6, false, { actorUserId: 1 });

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'DEACTIVATE_USER', modul: 'USER' })
    );
  });

  it('harus mencatat audit log ACTIVATE_USER saat mengaktifkan', async () => {
    authRepository.findById.mockResolvedValue({ id: 6, username: 'admin1', peran: 'ADMIN', aktif: false });

    await updateUserStatus(6, true, { actorUserId: 1 });

    expect(recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'ACTIVATE_USER', modul: 'USER' })
    );
  });
});
describe('auth.service — login deteksi IP baru / LOGIN_IP_BARU (Unit Test)', () => {
  let mockRedis;
  const userRow = {
    id: 7, aktif: true, password_hash: 'hashed', peran: 'ADMIN', username: 'admin1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
      sismember: jest.fn().mockResolvedValue(0),
      sadd: jest.fn().mockResolvedValue(1),
    };
    getRedisClient.mockReturnValue(mockRedis);
    signAccessToken.mockReturnValue('fake-access-token');
    signRefreshToken.mockReturnValue('fake-refresh-token');
    recordAuditLog.mockResolvedValue(1);
    authRepository.findByUsername.mockResolvedValue(userRow);
    comparePassword.mockResolvedValue(true);
  });

  it('IP belum dikenal → kirim LOGIN_IP_BARU, sadd IP, refresh TTL 30 hari', async () => {
    mockRedis.sismember.mockResolvedValue(0);

    await login({ username: 'admin1', password: 'benar', ipAddress: '203.0.113.9' });

    expect(mockRedis.sismember).toHaveBeenCalledWith('known_ips:7', '203.0.113.9');
    expect(notifyLeaders).toHaveBeenCalledWith(
      expect.objectContaining({ jenis: 'LOGIN_IP_BARU' })
    );
    expect(mockRedis.sadd).toHaveBeenCalledWith('known_ips:7', '203.0.113.9');
    expect(mockRedis.expire).toHaveBeenCalledWith('known_ips:7', 30 * 24 * 60 * 60);
  });

  it('IP sudah dikenal → tidak ada notifikasi, TTL tetap di-refresh', async () => {
    mockRedis.sismember.mockResolvedValue(1);

    await login({ username: 'admin1', password: 'benar', ipAddress: '203.0.113.9' });

    expect(notifyLeaders).not.toHaveBeenCalled();
    expect(mockRedis.sadd).not.toHaveBeenCalled();
    expect(mockRedis.expire).toHaveBeenCalledWith('known_ips:7', 30 * 24 * 60 * 60);
  });

  it('tanpa ipAddress (pemanggil lama) → pengecekan IP dilewati, login tetap sukses', async () => {
    const result = await login({ username: 'admin1', password: 'benar' });

    expect(mockRedis.sismember).not.toHaveBeenCalled();
    expect(result.accessToken).toBe('fake-access-token');
  });

  it('error Redis saat cek IP tidak menggagalkan login', async () => {
    mockRedis.sismember.mockRejectedValue(new Error('Redis down'));

    const result = await login({ username: 'admin1', password: 'benar', ipAddress: '203.0.113.9' });

    expect(result.peran).toBe('ADMIN');
    expect(result.accessToken).toBe('fake-access-token');
  });
});
