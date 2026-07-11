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

// Preview: kolom & data identik dengan generate di atas, tapi hanya
// PREVIEW_LIMIT baris pertama, dan TIDAK memicu audit log/notifikasi/file
// — dipakai user untuk meninjau data sebelum benar-benar klik Export.
router.get('/reports/jemaat/preview', authenticate, reportController.jemaatReportPreview);
router.get('/reports/event/preview', authenticate, reportController.eventReportPreview);
router.get('/reports/cg/preview', authenticate, reportController.cgReportPreview);
router.get('/reports/volunteer/preview', authenticate, reportController.volunteerReportPreview);
router.get('/reports/analytics/preview', authenticate, reportController.analyticsReportPreview);

// Download file laporan via signed token (tidak perlu auth — token sudah aman)
router.get('/reports/download/:token', reportController.downloadReport);

module.exports = router;