const { body } = require('express-validator');

// Mencerminkan validasi manual di auth.controller (login & reset-password).
// Pesan dibuat identik dengan yang sudah ada agar kontrak tidak berubah.

const loginValidation = [
  body('username').notEmpty().withMessage('Username dan password wajib diisi'),
  body('password').notEmpty().withMessage('Username dan password wajib diisi'),
];

const resetPasswordValidation = [
  body('newPassword').notEmpty().withMessage('newPassword wajib diisi'),
];

module.exports = { loginValidation, resetPasswordValidation };
