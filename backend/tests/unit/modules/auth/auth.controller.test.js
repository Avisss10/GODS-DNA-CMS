jest.mock('../../../../src/modules/auth/auth.service');
jest.mock('../../../../src/modules/auth/auth.repository');

const authService = require('../../../../src/modules/auth/auth.service');
const authRepository = require('../../../../src/modules/auth/auth.repository');
const { login, refresh, me } = require('../../../../src/modules/auth/auth.controller');

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
