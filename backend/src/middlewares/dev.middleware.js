const crypto = require('crypto');

/**
 * Bandingkan dua string secara constant-time. crypto.timingSafeEqual
 * mengharuskan buffer panjangnya sama persis (throw kalau tidak) —
 * dibungkus supaya panjang header yang beda cukup dianggap "tidak cocok"
 * tanpa membocorkan info panjang lewat timing perbandingan awal.
 */
function safeCompare(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Gerbang akses rute dev-only (kelola akun LEADER lewat backend/rest-dev.http)
 * — TANPA sesi login, murni dicek lewat header X-Dev-Secret vs
 * DEV_MANAGEMENT_SECRET di .env. Meniru pola RECOVERY_CODE_HASH yang
 * sudah ada (offline, developer-only), tapi lewat HTTP.
 */
function requireDevSecret(req, res, next) {
  const expected = process.env.DEV_MANAGEMENT_SECRET;
  if (!expected) {
    return res.status(503).json({ message: 'Dev management belum dikonfigurasi di server' });
  }

  const provided = req.headers['x-dev-secret'];
  if (!provided || typeof provided !== 'string' || !safeCompare(provided, expected)) {
    return res.status(403).json({ message: 'Akses ditolak' });
  }

  return next();
}

module.exports = { requireDevSecret };
