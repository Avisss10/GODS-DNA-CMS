const jwt = require('jsonwebtoken');

// BAGIAN 1.1 langkah 9: access token 8 jam, refresh token 7 hari
const ACCESS_TOKEN_EXPIRY = '8h';
const REFRESH_TOKEN_EXPIRY = '7d';

/**
 * Membuat access token JWT.
 * Payload minimal: userId (untuk lookup user), peran (untuk
 * authorization check LEADER/ADMIN tanpa query DB berulang).
 *
 * @param {{ userId: number, peran: string }} payload
 * @returns {string} JWT access token
 */
function signAccessToken(payload) {
  if (!payload || !payload.userId || !payload.peran) {
    throw new Error('Payload access token wajib menyertakan userId dan peran');
  }
  return jwt.sign(
    { userId: payload.userId, peran: payload.peran },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

/**
 * Membuat refresh token JWT.
 * @param {{ userId: number }} payload
 * @returns {string} JWT refresh token
 */
function signRefreshToken(payload) {
  if (!payload || !payload.userId) {
    throw new Error('Payload refresh token wajib menyertakan userId');
  }
  return jwt.sign(
    { userId: payload.userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

/**
 * Memverifikasi access token. Melempar error dari jsonwebtoken
 * (TokenExpiredError, JsonWebTokenError) jika tidak valid/expired —
 * caller (middleware) bertanggung jawab menangkap dan menerjemahkan
 * ke response HTTP yang sesuai.
 *
 * @param {string} token
 * @returns {{ userId: number, peran: string, iat: number, exp: number }}
 */
function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

/**
 * Memverifikasi refresh token.
 * @param {string} token
 * @returns {{ userId: number, iat: number, exp: number }}
 */
function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

module.exports = {
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};