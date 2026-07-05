const { body, param } = require('express-validator');

// Mencerminkan validasi manual di auth.controller (login & reset-password).
// Pesan dibuat identik dengan yang sudah ada agar kontrak tidak berubah.

const loginValidation = [
  body('username').notEmpty().withMessage('Username dan password wajib diisi'),
  body('password').notEmpty().withMessage('Username dan password wajib diisi'),
];

const resetPasswordValidation = [
  body('newPassword').notEmpty().withMessage('newPassword wajib diisi'),
];

// loginValidation di atas tidak mensyaratkan panjang minimum username
// (BAGIAN 1.1 tidak menyebutnya) — minLength 4 dipilih sebagai ambang
// wajar untuk akun baru, karena paper tidak menentukan angka pasti.
const createUserValidation = [
  body('username')
    .notEmpty().withMessage('Username wajib diisi')
    .isLength({ min: 4 }).withMessage('Username minimal 4 karakter'),
  body('password')
    .notEmpty().withMessage('Password wajib diisi')
    .isLength({ min: 8 }).withMessage('Password minimal 8 karakter'),
  body('peran')
    .notEmpty().withMessage('Peran wajib diisi')
    .isIn(['LEADER', 'ADMIN']).withMessage('Peran harus LEADER atau ADMIN'),
];

const updateStatusValidation = [
  param('id').isInt().withMessage('ID user tidak valid'),
  body('aktif').isBoolean().withMessage('aktif harus bernilai boolean'),
];

module.exports = {
  loginValidation,
  resetPasswordValidation,
  createUserValidation,
  updateStatusValidation,
};
