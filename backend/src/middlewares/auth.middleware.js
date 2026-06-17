const { verifyAccessToken } = require('../utils/jwt.util');
const { getRedisClient } = require('../config/redis');
const { tokenBlacklistKey } = require('../modules/auth/auth.service');

/**
 * Middleware autentikasi — memverifikasi access token dari httpOnly
 * cookie (BAGIAN 1.1 langkah 11), menolak jika token tidak ada,
 * tidak valid/expired, atau sudah di-blacklist (BAGIAN 1.1 langkah 8
 * dan BAGIAN 1.2 langkah 2 — sesi yang sudah di-invalidasi).
 *
 * Jika valid, attach req.user = { userId, peran } untuk dipakai
 * controller/middleware berikutnya (termasuk requireRole).
 */
async function authenticate(req, res, next) {
  const token = req.cookies?.access_token;

  if (!token) {
    return res.status(401).json({ message: 'Token tidak ditemukan, silakan login' });
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    return res.status(401).json({ message: 'Token tidak valid atau sudah kedaluwarsa' });
  }

  try {
    const redis = getRedisClient();
    const isBlacklisted = await redis.get(tokenBlacklistKey(token));
    if (isBlacklisted) {
      return res.status(401).json({ message: 'Sesi sudah tidak berlaku, silakan login kembali' });
    }
  } catch (err) {
    console.error('Auth middleware — gagal cek blacklist Redis:', err.message);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }

  req.user = { userId: decoded.userId, peran: decoded.peran };
  return next();
}

/**
 * Middleware authorization — membatasi akses hanya untuk peran
 * tertentu (misal hanya LEADER). Dipakai SETELAH authenticate,
 * karena bergantung pada req.user yang di-attach olehnya.
 *
 * @param {...string} allowedRoles
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Token tidak ditemukan, silakan login' });
    }
    if (!allowedRoles.includes(req.user.peran)) {
      return res.status(403).json({ message: 'Anda tidak memiliki akses untuk aksi ini' });
    }
    return next();
  };
}

module.exports = { authenticate, requireRole };