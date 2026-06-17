beforeAll(() => {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-for-unit-test';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-unit-test';
});

const {
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} = require('../../../src/utils/jwt.util');

describe('jwt.util — konstanta expiry (Unit Test)', () => {
  it('ACCESS_TOKEN_EXPIRY harus 8h sesuai BAGIAN 1.1', () => {
    expect(ACCESS_TOKEN_EXPIRY).toBe('8h');
  });

  it('REFRESH_TOKEN_EXPIRY harus 7d sesuai BAGIAN 1.1', () => {
    expect(REFRESH_TOKEN_EXPIRY).toBe('7d');
  });
});

describe('jwt.util — signAccessToken & verifyAccessToken (Unit Test)', () => {
  it('harus berhasil sign dan verify access token dengan payload yang benar', () => {
    const token = signAccessToken({ userId: 1, peran: 'ADMIN' });
    const decoded = verifyAccessToken(token);

    expect(decoded.userId).toBe(1);
    expect(decoded.peran).toBe('ADMIN');
  });

  it('harus melempar error jika payload tidak menyertakan userId', () => {
    expect(() => signAccessToken({ peran: 'ADMIN' })).toThrow(
      'Payload access token wajib menyertakan userId dan peran'
    );
  });

  it('harus melempar error jika payload tidak menyertakan peran', () => {
    expect(() => signAccessToken({ userId: 1 })).toThrow(
      'Payload access token wajib menyertakan userId dan peran'
    );
  });

  it('verifyAccessToken harus melempar error untuk token tidak valid', () => {
    expect(() => verifyAccessToken('token-acak-tidak-valid')).toThrow();
  });

  it('verifyAccessToken harus melempar error jika token ditandatangani dengan secret berbeda', () => {
    const jwt = require('jsonwebtoken');
    const tokenDenganSecretLain = jwt.sign(
      { userId: 1, peran: 'ADMIN' },
      'secret-yang-salah'
    );
    expect(() => verifyAccessToken(tokenDenganSecretLain)).toThrow();
  });
});

describe('jwt.util — signRefreshToken & verifyRefreshToken (Unit Test)', () => {
  it('harus berhasil sign dan verify refresh token dengan payload yang benar', () => {
    const token = signRefreshToken({ userId: 42 });
    const decoded = verifyRefreshToken(token);

    expect(decoded.userId).toBe(42);
  });

  it('harus melempar error jika payload tidak menyertakan userId', () => {
    expect(() => signRefreshToken({})).toThrow(
      'Payload refresh token wajib menyertakan userId'
    );
  });

  it('verifyRefreshToken harus melempar error untuk token tidak valid', () => {
    expect(() => verifyRefreshToken('token-acak-tidak-valid')).toThrow();
  });

  it('access token TIDAK BOLEH valid jika diverifikasi sebagai refresh token (secret berbeda)', () => {
    const accessToken = signAccessToken({ userId: 1, peran: 'ADMIN' });
    expect(() => verifyRefreshToken(accessToken)).toThrow();
  });
});