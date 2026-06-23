const express = require('express');
const router = express.Router();
const reportController = require('./report.controller');
const { authenticate } = require('../../middlewares/auth.middleware');

// Semua endpoint laporan memerlukan autentikasi
// ADMIN dan LEADER sama-sama bisa generate laporan
router.get('/reports/jemaat', authenticate, reportController.jemaatReport);
router.get('/reports/event', authenticate, reportController.eventReport);
router.get('/reports/cg', authenticate, reportController.cgReport);
router.get('/reports/volunteer', authenticate, reportController.volunteerReport);
router.get('/reports/analytics', authenticate, reportController.analyticsReport);

// Download file laporan via signed token (tidak perlu auth — token sudah aman)
router.get('/reports/download/:token', reportController.downloadReport);

module.exports = router;