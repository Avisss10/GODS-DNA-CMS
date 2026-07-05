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

describe('encryption.util — performa (Unit Test)', () => {
  // Ambang batas 50ms per siklus encrypt+decrypt (BAB II §2.2.10, BAB III §3.3.4).
  const AMBANG_BATAS_MS = 50;
  const JUMLAH_ITERASI = 10;

  // Kategori ukuran plaintext sesuai BAB II §2.2.10
  const kategoriUkuran = [
    { nama: 'kecil (< 50 karakter)', plaintext: 'x'.repeat(30) },
    { nama: 'sedang (50–200 karakter)', plaintext: 'x'.repeat(120) },
    { nama: 'besar (200–500 karakter)', plaintext: 'x'.repeat(400) },
  ];

  kategoriUkuran.forEach(({ nama, plaintext }) => {
    it(`satu siklus encrypt+decrypt data ${nama} harus selesai < ${AMBANG_BATAS_MS}ms`, () => {
      // Warm-up: siklus pertama bisa lebih lambat (inisialisasi modul crypto),
      // tidak ikut diukur agar angka mencerminkan operasi normal.
      const warmUp = encrypt(plaintext);
      decrypt(warmUp.ciphertext, warmUp.iv);

      const durasiMs = [];
      let contohCiphertext = '';

      for (let i = 0; i < JUMLAH_ITERASI; i += 1) {
        const mulai = process.hrtime.bigint();
        const { ciphertext, iv } = encrypt(plaintext);
        const hasil = decrypt(ciphertext, iv);
        const selesai = process.hrtime.bigint();

        expect(hasil).toBe(plaintext);
        durasiMs.push(Number(selesai - mulai) / 1e6);
        contohCiphertext = ciphertext;
      }

      const rataRata = durasiMs.reduce((total, d) => total + d, 0) / durasiMs.length;
      const maksimum = Math.max(...durasiMs);

      // Ukuran data: plaintext dalam byte UTF-8 vs ciphertext sebagai string hex
      // (1 karakter hex = 1 byte saat disimpan sebagai string di database).
      const ukuranPlaintextByte = Buffer.byteLength(plaintext, 'utf8');
      const ukuranCiphertextHexByte = contohCiphertext.length;
      const rasioEkspansi = ukuranCiphertextHexByte / ukuranPlaintextByte;

      // eslint-disable-next-line no-console
      console.log(
        `[PERF] ${nama}: rata-rata=${rataRata.toFixed(4)}ms, maks=${maksimum.toFixed(4)}ms ` +
          `(${JUMLAH_ITERASI} iterasi) | plaintext=${ukuranPlaintextByte} byte, ` +
          `ciphertext hex=${ukuranCiphertextHexByte} byte, rasio ekspansi=${rasioEkspansi.toFixed(2)}x`
      );

      // Setiap siklus tunggal (termasuk yang paling lambat) harus di bawah ambang batas
      expect(maksimum).toBeLessThan(AMBANG_BATAS_MS);
      expect(rataRata).toBeLessThan(AMBANG_BATAS_MS);
    });
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