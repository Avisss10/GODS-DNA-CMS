const crypto = require('crypto');

/**
 * Normalisasi nomor HP sebelum di-hash: buang semua karakter non-digit
 * (spasi, tanda hubung, tanda kurung) supaya variasi format penulisan
 * nomor yang sama menghasilkan hash yang konsisten.
 *
 * @param {string} plaintext
 * @returns {string} hanya digit
 */
function normalizePhone(plaintext) {
  return String(plaintext == null ? '' : plaintext).replace(/\D/g, '');
}

/**
 * Menghasilkan SHA-256 hex dari nomor HP yang sudah dinormalkan.
 * Dipakai untuk pencarian duplikat nomor HP tanpa perlu dekripsi
 * massal (audit item 5) — disimpan di kolom jemaat.no_hp_hash yang
 * ber-index, sehingga pencarian menjadi lookup O(log n) bukan full scan.
 *
 * Bersifat satu-arah: tidak menggantikan enkripsi AES no_hp (yang tetap
 * diperlukan untuk menampilkan kembali nomor aslinya), hanya untuk
 * pencocokan/equality.
 *
 * @param {string} plaintext
 * @returns {string} hex 64 karakter
 */
function hashPhone(plaintext) {
  return crypto.createHash('sha256').update(normalizePhone(plaintext)).digest('hex');
}

module.exports = { hashPhone, normalizePhone };
