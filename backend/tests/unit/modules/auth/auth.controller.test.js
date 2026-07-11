jest.mock('../../../../src/modules/auth/auth.service');
jest.mock('../../../../src/modules/auth/auth.repository');

const authService = require('../../../../src/modules/auth/auth.service');
const authRepository = require('../../../../src/modules/auth/auth.repository');
const {
  login, refresh, me, updateUserStatus, devCreateUser, devUpdateUserStatus, devResetPassword,
} = require('../../../../src/modules/auth/auth.controller');

function buildMockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
}

describe('auth.controller — flag secure pada cookie (Unit Test)', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    authService.login.mockResolvedValue({
      peran: 'LEADER',
      nama: 'leader1',
      accessToken: 'fake-access',
      refreshToken: 'fake-refresh',
    });
    authService.refreshAccessToken.mockResolvedValue({ accessToken: 'fake-access-baru' });
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('login: cookie access_token & refresh_token harus secure=true di production', async () => {
    process.env.NODE_ENV = 'production';
    const res = buildMockRes();

    await login({ body: { username: 'leader1', password: 'rahasia' }, ip: '10.0.0.1' }, res);

    expect(res.cookie).toHaveBeenCalledWith(
      'access_token', 'fake-access',
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict' })
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token', 'fake-refresh',
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict' })
    );
  });

  it('login: cookie harus secure=false di luar production (dev/test)', async () => {
    process.env.NODE_ENV = 'test';
    const res = buildMockRes();

    await login({ body: { username: 'leader1', password: 'rahasia' }, ip: '10.0.0.1' }, res);

    expect(res.cookie).toHaveBeenCalledWith(
      'access_token', 'fake-access',
      expect.objectContaining({ secure: false })
    );
  });

  it('refresh: cookie access_token baru harus secure=true di production', async () => {
    process.env.NODE_ENV = 'production';
    const res = buildMockRes();

    await refresh({ cookies: { refresh_token: 'fake-refresh' } }, res);

    expect(res.cookie).toHaveBeenCalledWith(
      'access_token', 'fake-access-baru',
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict' })
    );
  });
});

describe('auth.controller — GET /api/auth/me (Unit Test)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('200: mengembalikan { userId, peran, nama } segar dari DB', async () => {
    authRepository.findById.mockResolvedValue({
      id: 7, username: 'leader1', peran: 'LEADER', aktif: true,
    });
    const res = buildMockRes();

    await me({ user: { userId: 7, peran: 'LEADER' } }, res);

    expect(authRepository.findById).toHaveBeenCalledWith(7);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ userId: 7, peran: 'LEADER', nama: 'leader1' });
  });

  it('401 jika user tidak ditemukan di DB', async () => {
    authRepository.findById.mockResolvedValue(null);
    const res = buildMockRes();

    await me({ user: { userId: 999 } }, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('401 jika user sudah dinonaktifkan', async () => {
    authRepository.findById.mockResolvedValue({
      id: 7, username: 'leader1', peran: 'LEADER', aktif: false,
    });
    const res = buildMockRes();

    await me({ user: { userId: 7 } }, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('500 untuk error DB tak terduga', async () => {
    authRepository.findById.mockRejectedValue(new Error('DB down'));
    const res = buildMockRes();

    await me({ user: { userId: 7 } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('auth.controller — updateUserStatus meneruskan actorRole (Unit Test)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('harus meneruskan actorUserId & actorRole dari req.user ke service', async () => {
    authService.updateUserStatus.mockResolvedValue({ username: 'leader1' });
    const res = buildMockRes();

    await updateUserStatus(
      { params: { id: '5' }, body: { aktif: false }, user: { userId: 1, peran: 'LEADER' } },
      res
    );

    expect(authService.updateUserStatus).toHaveBeenCalledWith(5, false, {
      actorUserId: 1,
      actorRole: 'LEADER',
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('auth.controller — jalur dev-only (Unit Test)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('devCreateUser: memanggil service dengan actorUserId:null, isDev:true', async () => {
    authService.createUser.mockResolvedValue({ id: 1, username: 'leader_baru', peran: 'LEADER' });
    const res = buildMockRes();

    await devCreateUser({ body: { username: 'leader_baru', password: 'PasswordBaru123', peran: 'LEADER' } }, res);

    expect(authService.createUser).toHaveBeenCalledWith(
      { username: 'leader_baru', password: 'PasswordBaru123', peran: 'LEADER' },
      { actorUserId: null, isDev: true }
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('devUpdateUserStatus: memanggil service dengan actorUserId:null, actorRole:null, isDev:true', async () => {
    authService.updateUserStatus.mockResolvedValue({ username: 'leader_lain' });
    const res = buildMockRes();

    await devUpdateUserStatus({ params: { id: '5' }, body: { aktif: false } }, res);

    expect(authService.updateUserStatus).toHaveBeenCalledWith(5, false, {
      actorUserId: null,
      actorRole: null,
      isDev: true,
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('devResetPassword: memanggil service dengan isDev:true, actorUserId null (leaderId)', async () => {
    authService.resetAdminPassword.mockResolvedValue({ username: 'leader_lain' });
    const res = buildMockRes();

    await devResetPassword({ params: { id: '5' }, body: { newPassword: 'PasswordBaru123' } }, res);

    expect(authService.resetAdminPassword).toHaveBeenCalledWith(null, 5, 'PasswordBaru123', { isDev: true });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('devResetPassword: 400 jika newPassword kosong (validasi controller, service tidak dipanggil)', async () => {
    const res = buildMockRes();

    await devResetPassword({ params: { id: '5' }, body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(authService.resetAdminPassword).not.toHaveBeenCalled();
  });
});
