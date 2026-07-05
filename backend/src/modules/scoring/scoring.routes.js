const express = require('express');
const router = express.Router();
const scoringController = require('./scoring.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRole } = require('../../middlewares/role.middleware');

// Hanya LEADER yang boleh memicu scoring manual (di luar jadwal cron 02:00)
router.post(
  '/scoring/run',
  authenticate,
  requireRole('LEADER'),
  scoringController.runScoring
);

module.exports = router;
