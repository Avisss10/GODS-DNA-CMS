jest.mock('../../../src/utils/jwt.util');
jest.mock('../../../src/config/redis');

const { verifyAccessToken } = require('../../../src/utils/jwt.util');
const { getRedisClient } = require('../../../src/config/redis');
const authMiddleware = require('../../../src/middlewares/auth.middleware');
const { authenticate } = authMiddleware;

describe('auth.middleware — authenticate (Unit Test)', () => {
  let req, res, next, mockRedis;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { cookies: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    mockRedis = { get: jest.fn().mockResolvedValue(null) };
    getRedisClient.mockReturnValue(mockRedis);
  });

  it('harus 401 jika tidak ada cookie access_token', async () => {
    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('harus 401 jika token tidak valid', async () => {
    req.cookies.access_token = 'token-rusak';
    verifyAccessToken.mockImplementation(() => { throw new Error('invalid'); });

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('harus 401 jika token ada di blacklist Redis', async () => {
    req.cookies.access_token = 'token-blacklisted';
    verifyAccessToken.mockReturnValue({ userId: 1, peran: 'ADMIN' });
    mockRedis.get.mockResolvedValue('1');

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('harus attach req.user dan panggil next() jika token valid dan tidak di-blacklist', async () => {
    req.cookies.access_token = 'token-valid';
    verifyAccessToken.mockReturnValue({ userId: 7, peran: 'LEADER' });
    mockRedis.get.mockResolvedValue(null);

    await authenticate(req, res, next);

    expect(req.user).toEqual({ userId: 7, peran: 'LEADER' });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('harus 500 jika Redis error saat cek blacklist', async () => {
    req.cookies.access_token = 'token-valid';
    verifyAccessToken.mockReturnValue({ userId: 7, peran: 'LEADER' });
    mockRedis.get.mockRejectedValue(new Error('Redis down'));

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('auth.middleware — requireRole sudah dihapus (single source of truth)', () => {
  it('tidak boleh lagi mengekspor requireRole (pindah ke role.middleware)', () => {
    expect(authMiddleware.requireRole).toBeUndefined();
  });
});