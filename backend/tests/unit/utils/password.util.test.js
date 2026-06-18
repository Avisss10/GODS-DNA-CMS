const {
  BCRYPT_COST,
  hashPassword,
  comparePassword,
} = require('../../../src/utils/password.util');

describe('password.util — hashPassword (Unit Test)', () => {
  it('harus menghasilkan hash dengan cost factor 12', async () => {
    const hash = await hashPassword('SecurePass123!');
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
  }, 15000);

  it('BCRYPT_COST harus bernilai 12 sesuai BAGIAN 0', () => {
    expect(BCRYPT_COST).toBe(12);
  });

  it('harus menghasilkan hash berbeda untuk password sama (karena salt acak)', async () => {
    const hashA = await hashPassword('SamePassword123');
    const hashB = await hashPassword('SamePassword123');
    expect(hashA).not.toBe(hashB);
  }, 15000);

  it('harus melempar error jika password kosong', async () => {
    await expect(hashPassword('')).rejects.toThrow('Password tidak boleh kosong');
  });

  it('harus melempar error jika password bukan string', async () => {
    await expect(hashPassword(undefined)).rejects.toThrow('Password tidak boleh kosong');
  });
});

describe('password.util — comparePassword (Unit Test)', () => {
  it('harus mengembalikan true untuk password yang cocok dengan hash-nya', async () => {
    const hash = await hashPassword('CorrectPassword1');
    const result = await comparePassword('CorrectPassword1', hash);
    expect(result).toBe(true);
  }, 15000);

  it('harus mengembalikan false untuk password yang tidak cocok', async () => {
    const hash = await hashPassword('CorrectPassword1');
    const result = await comparePassword('WrongPassword1', hash);
    expect(result).toBe(false);
  }, 15000);

  it('harus mengembalikan false (bukan throw) jika hash bukan string valid', async () => {
    const result = await comparePassword('AnyPassword', 'bukan-hash-valid');
    expect(result).toBe(false);
  });

  it('harus mengembalikan false jika salah satu argumen bukan string', async () => {
    const result = await comparePassword(undefined, 'somehash');
    expect(result).toBe(false);
  });
});