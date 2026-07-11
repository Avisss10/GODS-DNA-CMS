const { requireDevSecret } = require('../../../src/middlewares/dev.middleware');

describe('dev.middleware — requireDevSecret (Unit Test)', () => {
  let req, res, next;
  const originalSecret = process.env.DEV_MANAGEMENT_SECRET;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  afterEach(() => {
    process.env.DEV_MANAGEMENT_SECRET = originalSecret;
  });

  it('harus 503 jika DEV_MANAGEMENT_SECRET belum diset di env', () => {
    delete process.env.DEV_MANAGEMENT_SECRET;
    req.headers['x-dev-secret'] = 'apapun';

    requireDevSecret(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  it('harus 403 jika header X-Dev-Secret tidak dikirim', () => {
    process.env.DEV_MANAGEMENT_SECRET = 'secret-rahasia-panjang';

    requireDevSecret(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('harus 403 jika secret salah', () => {
    process.env.DEV_MANAGEMENT_SECRET = 'secret-rahasia-panjang';
    req.headers['x-dev-secret'] = 'secret-salah';

    requireDevSecret(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('harus 403 (bukan throw) jika panjang header beda dari secret', () => {
    process.env.DEV_MANAGEMENT_SECRET = 'secret-rahasia-panjang';
    req.headers['x-dev-secret'] = 'pendek';

    expect(() => requireDevSecret(req, res, next)).not.toThrow();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('harus panggil next() jika secret cocok persis', () => {
    process.env.DEV_MANAGEMENT_SECRET = 'secret-rahasia-panjang';
    req.headers['x-dev-secret'] = 'secret-rahasia-panjang';

    requireDevSecret(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
