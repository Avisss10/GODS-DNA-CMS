const express = require('express');
const { login, logout } = require('./auth.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.post('/auth/login', login);
router.post('/auth/logout', authenticate, logout);

module.exports = router;