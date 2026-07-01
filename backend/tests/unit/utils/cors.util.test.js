const { corsOriginValidator } = require('../../../src/utils/cors.util');

describe('cors.util — corsOriginValidator (Unit Test)', () => {
  const ORIGINAL = process.env.ALLOWED_ORIGINS;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = ORIGINAL;
  });

  it('harus mengizinkan request tanpa Origin (server-to-server / curl / Postman)', () => {
    process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
    const cb = jest.fn();
    corsOriginValidator(undefined, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('harus mengizinkan origin yang ada di whitelist', () => {
    process.env.ALLOWED_ORIGINS = 'http://localhost:5173, https://app.example.com';
    const cb = jest.fn();
    corsOriginValidator('https://app.example.com', cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('harus menolak origin yang tidak ada di whitelist', () => {
    process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
    const cb = jest.fn();
    corsOriginValidator('https://evil.example.com', cb);
    expect(cb).toHaveBeenCalledWith(null, false);
  });

  it('harus menolak origin asing jika ALLOWED_ORIGINS kosong/tidak diset', () => {
    delete process.env.ALLOWED_ORIGINS;
    const cb = jest.fn();
    corsOriginValidator('https://evil.example.com', cb);
    expect(cb).toHaveBeenCalledWith(null, false);
  });
});
