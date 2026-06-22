/**
 * Middleware otorisasi berbasis peran (role).
 * Dipasang setelah middleware `authenticate`.
 * req.user sudah tersedia dari authenticate sebelumnya.
 *
 * Contoh pemakaian:
 *   router.post('/volunteer-types', authenticate, requireRole('ADMIN', 'LEADER'), controller.create)
 *
 * @param {...string} allowedRoles - daftar peran yang diizinkan
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const userRole = req.user?.peran ?? req.user?.role ?? null;

    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        message: 'Akses ditolak: peran Anda tidak diizinkan untuk aksi ini',
      });
    }

    return next();
  };
}

module.exports = { requireRole };