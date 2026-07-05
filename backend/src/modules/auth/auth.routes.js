const express = require('express');
const { login, logout, refresh, me, listAdmins, listUsers, resetAdminPassword, createUser, updateUserStatus } = require('./auth.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRole } = require('../../middlewares/role.middleware');
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
router.get('/users', authenticate, requireRole('LEADER'), listUsers);
router.get('/users/admins', authenticate, requireRole('LEADER'), listAdmins);
router.put('/users/:id/reset-password', authenticate, requireRole('LEADER'), resetPasswordValidation, handleValidationErrors, resetAdminPassword);
router.post('/users', authenticate, requireRole('LEADER'), createUserValidation, handleValidationErrors, createUser);
router.patch('/users/:id/status', authenticate, requireRole('LEADER'), updateStatusValidation, handleValidationErrors, updateUserStatus);

module.exports = router;