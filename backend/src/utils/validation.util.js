/**
 * Utility validasi input yang digunakan di seluruh modul.
 * Sesuai prinsip DRY — validasi terpusat, bukan tersebar di setiap controller.
 */

/**
 * Validasi bahwa semua environment variable wajib sudah di-set.
 * Dipanggil saat startup — app crash jika ada yang missing.
 * @param {string[]} requiredVars
 * @throws {Error} jika ada env var yang missing
 */
function validateEnvVars(requiredVars) {
  const missing = requiredVars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `Environment variables wajib tidak ditemukan: ${missing.join(', ')}`
    );
  }
}

/**
 * Validasi bahwa nilai adalah integer positif.
 * @param {any} value
 * @returns {boolean}
 */
function isPositiveInteger(value) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0;
}

/**
 * Validasi format tanggal (YYYY-MM-DD).
 * @param {string} dateStr
 * @returns {boolean}
 */
function isValidDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

/**
 * Validasi format datetime (YYYY-MM-DD HH:MM:SS atau ISO).
 * @param {string} datetimeStr
 * @returns {boolean}
 */
function isValidDatetime(datetimeStr) {
  if (!datetimeStr || typeof datetimeStr !== 'string') return false;
  const date = new Date(datetimeStr);
  return !isNaN(date.getTime());
}

/**
 * Sanitasi string — trim whitespace dan escape karakter berbahaya.
 * Tidak menggunakan regex replace karena rentan — cukup trim.
 * @param {string} str
 * @returns {string}
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str.trim();
}

/**
 * Validasi password strength:
 * - Minimal 8 karakter
 * - Mengandung huruf besar, huruf kecil, dan angka
 * @param {string} password
 * @returns {{ valid: boolean, message?: string }}
 */
function validatePassword(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password wajib diisi' };
  }
  if (password.length < 8) {
    return { valid: false, message: 'Password minimal 8 karakter' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password harus mengandung huruf besar' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password harus mengandung huruf kecil' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password harus mengandung angka' };
  }
  return { valid: true };
}

module.exports = {
  validateEnvVars,
  isPositiveInteger,
  isValidDate,
  isValidDatetime,
  sanitizeString,
  validatePassword,
};