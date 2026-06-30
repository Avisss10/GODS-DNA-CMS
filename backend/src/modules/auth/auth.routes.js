const express = require('express');
const { login, logout, listAdmins, resetAdminPassword } = require('./auth.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRole } = require('../../middlewares/role.middleware');

const router = express.Router();

router.post('/auth/login', login);
router.post('/auth/logout', authenticate, logout);

// Manajemen user — hanya LEADER
router.get('/users/admins', authenticate, requireRole('LEADER'), listAdmins);
router.put('/users/:id/reset-password', authenticate, requireRole('LEADER'), resetAdminPassword);

module.exports = router;