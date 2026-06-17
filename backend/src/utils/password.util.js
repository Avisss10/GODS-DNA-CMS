const bcrypt = require('bcrypt');

// BAGIAN 0: "Hash Password: bcrypt (cost=12)"
const BCRYPT_COST = 12;

/**
 * Hash password plaintext menggunakan bcrypt cost factor 12.
 * @param {string} plainPassword
 * @returns {Promise<string>} password_hash
 */
async function hashPassword(plainPassword) {
  if (typeof plainPassword !== 'string' || plainPassword.length === 0) {
    throw new Error('Password tidak boleh kosong');
  }
  return bcrypt.hash(plainPassword, BCRYPT_COST);
}

/**
 * Membandingkan password plaintext dengan hash yang tersimpan.
 * @param {string} plainPassword
 * @param {string} passwordHash
 * @returns {Promise<boolean>}
 */
async function comparePassword(plainPassword, passwordHash) {
  if (typeof plainPassword !== 'string' || typeof passwordHash !== 'string') {
    return false;
  }
  return bcrypt.compare(plainPassword, passwordHash);
}

module.exports = {
  BCRYPT_COST,
  hashPassword,
  comparePassword,
};