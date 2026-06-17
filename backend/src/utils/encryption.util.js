const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH_BYTES = 16; // BAGIAN 2.1 langkah 3: "IV acak (16 bytes)"

/**
 * Mengambil dan memvalidasi encryption key dari environment.
 * AES-256 butuh key tepat 32 byte — disimpan di .env sebagai
 * hex string 64 karakter (32 byte = 64 hex char).
 *
 * @returns {Buffer}
 */
function getEncryptionKey() {
  const hexKey = process.env.AES_ENCRYPTION_KEY;
  if (!hexKey) {
    throw new Error('AES_ENCRYPTION_KEY belum dikonfigurasi di environment');
  }

  const keyBuffer = Buffer.from(hexKey, 'hex');
  if (keyBuffer.length !== 32) {
    throw new Error(
      `AES_ENCRYPTION_KEY harus berupa hex string 64 karakter (32 byte), ditemukan ${keyBuffer.length} byte`
    );
  }

  return keyBuffer;
}

/**
 * Mengenkripsi plaintext menggunakan AES-256-CBC dengan IV acak baru.
 * Sesuai BAGIAN 2.1 langkah 3: setiap enkripsi menghasilkan IV baru,
 * disimpan terpisah dari ciphertext (kolom *_iv).
 *
 * @param {string} plaintext
 * @returns {{ ciphertext: string, iv: string }} keduanya dalam format hex
 */
function encrypt(plaintext) {
  if (typeof plaintext !== 'string') {
    throw new Error('Plaintext harus berupa string');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  return {
    ciphertext,
    iv: iv.toString('hex'),
  };
}

/**
 * Mendekripsi ciphertext menggunakan IV yang tersimpan terpisah.
 *
 * @param {string} ciphertext hex string
 * @param {string} ivHex hex string (16 byte)
 * @returns {string} plaintext asli
 */
function decrypt(ciphertext, ivHex) {
  if (typeof ciphertext !== 'string' || typeof ivHex !== 'string') {
    throw new Error('Ciphertext dan IV harus berupa string hex');
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

/**
 * Helper untuk mengenkripsi data JSON (dipakai untuk media_sosial).
 * JSON.stringify dulu sebelum dienkripsi, karena AES bekerja pada
 * string/buffer, bukan struktur object langsung (BAGIAN 0: kolom
 * media_sosial bertipe JSON, BAGIAN 2.1: dienkripsi seperti field lain).
 *
 * @param {object} jsonData
 * @returns {{ ciphertext: string, iv: string }}
 */
function encryptJson(jsonData) {
  return encrypt(JSON.stringify(jsonData));
}

/**
 * Helper untuk mendekripsi data JSON dan mem-parse-nya kembali.
 *
 * @param {string} ciphertext
 * @param {string} ivHex
 * @returns {object}
 */
function decryptJson(ciphertext, ivHex) {
  const plaintext = decrypt(ciphertext, ivHex);
  return JSON.parse(plaintext);
}

module.exports = {
  encrypt,
  decrypt,
  encryptJson,
  decryptJson,
  getEncryptionKey,
};