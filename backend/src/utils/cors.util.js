/**
 * Validator origin untuk CORS berbasis whitelist (audit item 2).
 *
 * ALLOWED_ORIGINS adalah daftar origin yang dipisah koma, mis:
 *   ALLOWED_ORIGINS=http://localhost:5173,https://app.example.com
 *
 * - Request tanpa Origin (server-to-server, curl, Postman) selalu diizinkan.
 * - Origin yang ada di whitelist diizinkan.
 * - Origin lain ditolak (callback(null, false)) — tanpa melempar error,
 *   sehingga request tetap diproses tetapi tanpa header CORS yang mengizinkan.
 */
function corsOriginValidator(origin, callback) {
  if (!origin) return callback(null, true);

  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (allowed.includes(origin)) return callback(null, true);

  return callback(null, false);
}

module.exports = { corsOriginValidator };
