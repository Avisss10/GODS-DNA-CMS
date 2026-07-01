const { validateEnv, REQUIRED_ENV_VARS } = require('../../../src/config/validate-env');

describe('validate-env — validateEnv (Unit Test)', () => {
  let exitSpy, errorSpy, savedEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    // Isi semua var wajib dengan nilai dummy agar baseline "lengkap".
    for (const v of REQUIRED_ENV_VARS) {
      process.env[v] = 'dummy-value';
    }
  });

  afterEach(() => {
    process.env = savedEnv;
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('tidak boleh exit jika semua env var wajib terisi', () => {
    validateEnv();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('harus console.error + process.exit(1) jika ada env var wajib yang kosong', () => {
    process.env.JWT_ACCESS_SECRET = '';

    validateEnv();

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join(' ');
    expect(errorOutput).toContain('JWT_ACCESS_SECRET');
  });

  it('harus mendeteksi env var yang tidak diset sama sekali (undefined)', () => {
    delete process.env.REDIS_HOST;

    validateEnv();

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errorOutput = errorSpy.mock.calls.flat().join(' ');
    expect(errorOutput).toContain('REDIS_HOST');
  });

  it('daftar REQUIRED_ENV_VARS harus mencakup secrets & koneksi inti', () => {
    expect(REQUIRED_ENV_VARS).toEqual(expect.arrayContaining([
      'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'AES_ENCRYPTION_KEY',
      'AUDIT_HMAC_SECRET', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'REDIS_HOST',
    ]));
  });
});
