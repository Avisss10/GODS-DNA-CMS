const express = require('express');
const {
  login, logout, refresh, me, listAdmins, listUsers, resetAdminPassword, createUser, updateUserStatus,
  devCreateUser, devUpdateUserStatus, devResetPassword,
} = require('./auth.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRole } = require('../../middlewares/role.middleware');
const { requireDevSecret } = require('../../middlewares/dev.middleware');
const { handleValidationErrors } = require('../../middlewares/validation.middleware');
const {
  loginValidation, resetPasswordValidation, createUserValidation, updateStatusValidation,
} = require('./auth.validation');

const router = express.Router();

router.post('/auth/login', loginValidation, handleValidationErrors, login);
router.post('/auth/logout', authenticate, logout);
// Tanpa authenticate: dipakai justru saat access token sudah expired.
router.post('/auth/refresh', refresh);
router.get('/auth/me', authenticate, me);

// Manajemen user — hanya LEADER
// GET /users mengembalikan SEMUA user (LEADER + ADMIN) untuk halaman
// User Management; /users/admins dipertahankan (khusus ADMIN) agar
// konsumen lama tidak berubah kontraknya.
// Leader tidak bisa kelola Leader lain (lihat guard di auth.service.js) —
// pengecualian itu hanya bisa dilewati lewat rute /dev/users di bawah.
router.get('/users', authenticate, requireRole('LEADER'), listUsers);
router.get('/users/admins', authenticate, requireRole('LEADER'), listAdmins);
router.put('/users/:id/reset-password', authenticate, requireRole('LEADER'), resetPasswordValidation, handleValidationErrors, resetAdminPassword);
router.post('/users', authenticate, requireRole('LEADER'), createUserValidation, handleValidationErrors, createUser);
router.patch('/users/:id/status', authenticate, requireRole('LEADER'), updateStatusValidation, handleValidationErrors, updateUserStatus);

// Dev-only — kelola akun LEADER, tanpa sesi login, digerbangi header
// X-Dev-Secret (lihat backend/rest-dev.http & DEV_MANAGEMENT_SECRET di .env).
router.post('/dev/users', requireDevSecret, createUserValidation, handleValidationErrors, devCreateUser);
router.patch('/dev/users/:id/status', requireDevSecret, updateStatusValidation, handleValidationErrors, devUpdateUserStatus);
router.put('/dev/users/:id/reset-password', requireDevSecret, resetPasswordValidation, handleValidationErrors, devResetPassword);

module.exports = router;