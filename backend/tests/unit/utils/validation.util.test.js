const {
  validateEnvVars,
  isPositiveInteger,
  isValidDate,
  isValidDatetime,
  sanitizeString,
  validatePassword,
} = require('../../../src/utils/validation.util');

describe('validation.util — validateEnvVars (Unit Test)', () => {
  it('harus throw jika ada env var yang missing', () => {
    const originalVal = process.env.TEST_VAR_XYZ;
    delete process.env.TEST_VAR_XYZ;

    expect(() => validateEnvVars(['TEST_VAR_XYZ']))
      .toThrow('Environment variables wajib tidak ditemukan: TEST_VAR_XYZ');

    if (originalVal !== undefined) process.env.TEST_VAR_XYZ = originalVal;
  });

  it('harus tidak throw jika semua env var ada', () => {
    process.env.TEST_VAR_EXIST = 'value';
    expect(() => validateEnvVars(['TEST_VAR_EXIST'])).not.toThrow();
    delete process.env.TEST_VAR_EXIST;
  });
});

describe('validation.util — isPositiveInteger (Unit Test)', () => {
  it('harus return true untuk integer positif', () => {
    expect(isPositiveInteger(1)).toBe(true);
    expect(isPositiveInteger(100)).toBe(true);
    expect(isPositiveInteger('5')).toBe(true);
  });

  it('harus return false untuk nilai bukan integer positif', () => {
    expect(isPositiveInteger(0)).toBe(false);
    expect(isPositiveInteger(-1)).toBe(false);
    expect(isPositiveInteger(1.5)).toBe(false);
    expect(isPositiveInteger('abc')).toBe(false);
  });
});

describe('validation.util — isValidDate (Unit Test)', () => {
  it('harus return true untuk format YYYY-MM-DD yang valid', () => {
    expect(isValidDate('2026-06-23')).toBe(true);
    expect(isValidDate('1990-01-01')).toBe(true);
  });

  it('harus return false untuk format yang tidak valid', () => {
    expect(isValidDate('23-06-2026')).toBe(false);
    expect(isValidDate('not-a-date')).toBe(false);
    expect(isValidDate('')).toBe(false);
    expect(isValidDate(null)).toBe(false);
  });
});

describe('validation.util — isValidDatetime (Unit Test)', () => {
  it('harus return true untuk datetime yang valid', () => {
    expect(isValidDatetime('2026-06-23 09:00:00')).toBe(true);
    expect(isValidDatetime('2026-06-23T09:00:00.000Z')).toBe(true);
  });

  it('harus return false untuk datetime yang tidak valid', () => {
    expect(isValidDatetime('bukan-datetime')).toBe(false);
    expect(isValidDatetime('')).toBe(false);
    expect(isValidDatetime(null)).toBe(false);
  });
});

describe('validation.util — sanitizeString (Unit Test)', () => {
  it('harus trim whitespace', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
    expect(sanitizeString('\tbudi\n')).toBe('budi');
  });

  it('harus return nilai asli jika bukan string', () => {
    expect(sanitizeString(123)).toBe(123);
    expect(sanitizeString(null)).toBe(null);
  });
});

describe('validation.util — validatePassword (Unit Test)', () => {
  it('harus valid untuk password yang memenuhi syarat', () => {
    expect(validatePassword('Password123').valid).toBe(true);
    expect(validatePassword('MyStr0ngPass').valid).toBe(true);
  });

  it('harus invalid jika kurang dari 8 karakter', () => {
    const result = validatePassword('Ab1');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/8 karakter/);
  });

  it('harus invalid jika tidak ada huruf besar', () => {
    const result = validatePassword('password123');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/huruf besar/);
  });

  it('harus invalid jika tidak ada angka', () => {
    const result = validatePassword('PasswordOnly');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/angka/);
  });

  it('harus invalid jika kosong', () => {
    const result = validatePassword('');
    expect(result.valid).toBe(false);
  });
});