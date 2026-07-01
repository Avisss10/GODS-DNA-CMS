const express = require('express');
const { login, logout, refresh, listAdmins, resetAdminPassword } = require('./auth.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRole } = require('../../middlewares/role.middleware');
const { handleValidationErrors } = require('../../middlewares/validation.middleware');
const { loginValidation, resetPasswordValidation } = require('./auth.validation');

const router = express.Router();

router.post('/auth/login', loginValidation, handleValidationErrors, login);
router.post('/auth/logout', authenticate, logout);
// Tanpa authenticate: dipakai justru saat access token sudah expired.
router.post('/auth/refresh', refresh);

// Manajemen user — hanya LEADER
router.get('/users/admins', authenticate, requireRole('LEADER'), listAdmins);
router.put('/users/:id/reset-password', authenticate, requireRole('LEADER'), resetPasswordValidation, handleValidationErrors, resetAdminPassword);

module.exports = router;