const { validationResult } = require('express-validator');

/**
 * Gate validasi terpusat (audit item 7). Dipasang SETELAH rangkaian
 * validation chain express-validator pada route POST/PUT.
 *
 * Bila ada error, mengembalikan 400 dengan bentuk { message: '...' } —
 * IDENTIK dengan pola error 400 manual yang sudah ada di service/
 * controller, sehingga kontrak response tidak berubah. Hanya pesan
 * error pertama yang dikirim (konsisten dengan validasi manual yang
 * mengembalikan satu pesan).
 *
 * Validasi manual di service layer tetap dipertahankan sebagai
 * defense-in-depth; middleware ini hanya gate lebih awal di route.
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }
  return next();
}

module.exports = { handleValidationErrors };
