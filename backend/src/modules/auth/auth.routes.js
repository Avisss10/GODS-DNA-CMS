const express = require('express');
const { login } = require('./auth.controller');

const router = express.Router();

router.post('/auth/login', login);

module.exports = router;