const crypto = require('crypto');

beforeAll(() => {
  // Key valid 32 byte (64 hex char) untuk keperluan test
  process.env.AES_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
});

const {
  encrypt,
  decrypt,
  encryptJson,
  decryptJson,
  getEncryptionKey,
} = require('../../../src/utils/encryption.util');

describe('encryption.util — getEncryptionKey (Unit Test)', () => {
  it('harus mengembalikan Buffer 32 byte jika key valid', () => {
    const key = getEncryptionKey();
    expect(Buffer.isBuffer(key)).toBe(true);
    expect(key.length).toBe(32);
  });

  it('harus melempar error jika AES_ENCRYPTION_KEY tidak ada', () => {
    const original = process.env.AES_ENCRYPTION_KEY;
    delete process.env.AES_ENCRYPTION_KEY;

    expect(() => getEncryptionKey()).toThrow('AES_ENCRYPTION_KEY belum dikonfigurasi');

    process.env.AES_ENCRYPTION_KEY = original;
  });

  it('harus melempar error jika key bukan 32 byte', () => {
    const original = process.env.AES_ENCRYPTION_KEY;
    process.env.AES_ENCRYPTION_KEY = 'abcd1234'; // terlalu pendek

    expect(() => getEncryptionKey()).toThrow(/harus berupa hex string 64 karakter/);

    process.env.AES_ENCRYPTION_KEY = original;
  });
});

describe('encryption.util — encrypt & decrypt (Unit Test)', () => {
  it('harus berhasil enkripsi dan dekripsi kembali ke plaintext asli', () => {
    const plaintext = '08123456789';
    const { ciphertext, iv } = encrypt(plaintext);

    const decrypted = decrypt(ciphertext, iv);
    expect(decrypted).toBe(plaintext);
  });

  it('harus menghasilkan IV sepanjang 16 byte (32 karakter hex)', () => {
    const { iv } = encrypt('data apapun');
    expect(iv).toHaveLength(32); // 16 byte = 32 hex char
  });

  it('harus menghasilkan ciphertext dan IV berbeda untuk plaintext sama (IV acak)', () => {
    const resultA = encrypt('SamaPersis');
    const resultB = encrypt('SamaPersis');

    expect(resultA.iv).not.toBe(resultB.iv);
    expect(resultA.ciphertext).not.toBe(resultB.ciphertext);
  });

  it('harus melempar error jika plaintext bukan string', () => {
    expect(() => encrypt(12345)).toThrow('Plaintext harus berupa string');
  });

  it('harus melempar error saat decrypt dengan IV yang salah', () => {
    const { ciphertext } = encrypt('data rahasia');
    const ivSalah = crypto.randomBytes(16).toString('hex');

    expect(() => decrypt(ciphertext, ivSalah)).toThrow();
  });

  it('harus bisa enkripsi-dekripsi string kosong', () => {
    const { ciphertext, iv } = encrypt('');
    expect(decrypt(ciphertext, iv)).toBe('');
  });

  it('harus bisa enkripsi-dekripsi string panjang (alamat lengkap)', () => {
    const alamatPanjang = 'Jl. Grand Wisata Blok A No. 12, RT 05/RW 03, Kel. Lambangsari, Kec. Tambun Selatan, Bekasi, Jawa Barat 17510';
    const { ciphertext, iv } = encrypt(alamatPanjang);

    expect(decrypt(ciphertext, iv)).toBe(alamatPanjang);
  });
});

describe('encryption.util — encryptJson & decryptJson (Unit Test)', () => {
  it('harus berhasil enkripsi-dekripsi object JSON (media_sosial)', () => {
    const mediaSosial = { instagram: '@jemaat123', facebook: 'Jemaat Test' };
    const { ciphertext, iv } = encryptJson(mediaSosial);

    const decrypted = decryptJson(ciphertext, iv);
    expect(decrypted).toEqual(mediaSosial);
  });

  it('harus berhasil enkripsi-dekripsi object JSON kosong', () => {
    const { ciphertext, iv } = encryptJson({});
    expect(decryptJson(ciphertext, iv)).toEqual({});
  });

  it('harus berhasil enkripsi-dekripsi array di dalam JSON', () => {
    const data = { nomor: ['08111', '08222'] };
    const { ciphertext, iv } = encryptJson(data);

    expect(decryptJson(ciphertext, iv)).toEqual(data);
  });
});